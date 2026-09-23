import type { FastifyInstance } from "fastify";
import { getProfile, resolveForConnection } from "../../core/credentialVault.js";
import { createJob, runJob, getJobStatus } from "../../core/jobRunner.js";
import { previewRoutines, runRoutinesJob, type RoutinesJobParams } from "./service.js";
import { logger } from "../../core/logger.js";

/**
 * _reversa_forward/005-perfil-conexao-por-usuario (D-06, RN-04): preview e criação de job recebem
 * o banco de origem/destino no corpo (o perfil não guarda mais banco), os perfis precisam ser do
 * usuário da sessão (404 caso contrário), e createdBy vem da sessão — não mais do corpo.
 */

interface RoutinesPreviewBody {
  sourceProfileId: string;
  sourceDatabase: string;
  select: "all" | string[];
  newDefiner?: string;
}

interface CreateRoutinesJobBody extends RoutinesPreviewBody {
  targetProfileId: string;
  targetDatabase: string;
  dropExisting?: boolean;
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function registerRoutinesRoutes(app: FastifyInstance): void {
  app.post<{ Body: RoutinesPreviewBody }>("/routines/preview", async (request, reply) => {
    const { sourceProfileId, sourceDatabase, select, newDefiner } = request.body ?? {};
    if (!isFilled(sourceDatabase)) return reply.code(400).send({ error: "sourceDatabase é obrigatório" });
    if (!(await getProfile(sourceProfileId, request.userId))) {
      return reply.code(404).send({ error: "perfil não encontrado" });
    }
    const sourceParams = await resolveForConnection(sourceProfileId, sourceDatabase.trim());
    const params: RoutinesJobParams = { select, newDefiner, dropExisting: false };
    const preview = await previewRoutines(sourceParams, params);
    return reply.send({ items: preview });
  });

  app.post<{ Body: CreateRoutinesJobBody }>("/routines/jobs", async (request, reply) => {
    const body = request.body ?? ({} as CreateRoutinesJobBody);
    if (!isFilled(body.sourceDatabase) || !isFilled(body.targetDatabase)) {
      return reply.code(400).send({ error: "sourceDatabase e targetDatabase são obrigatórios" });
    }
    const [source, target] = await Promise.all([
      getProfile(body.sourceProfileId, request.userId),
      getProfile(body.targetProfileId, request.userId),
    ]);
    if (!source || !target) return reply.code(404).send({ error: "perfil não encontrado" });

    const jobId = await createJob({
      feature: "routines",
      params: {
        select: body.select,
        newDefiner: body.newDefiner,
        dropExisting: body.dropExisting ?? true,
      } satisfies RoutinesJobParams,
      sourceProfileId: body.sourceProfileId,
      targetProfileId: body.targetProfileId,
      sourceDatabase: body.sourceDatabase.trim(),
      targetDatabase: body.targetDatabase.trim(),
      createdBy: request.username,
    });

    // Fire-and-forget: devolve 202 imediatamente, o job roda em background (sem fila,
    // decisão híbrida de paradigma — paradigm_decision.md).
    runJob(jobId, runRoutinesJob).catch((err) => {
      logger.error(`Job de rotinas ${jobId} falhou`, { error: String(err) });
    });

    return reply.code(202).send({ id: jobId });
  });

  app.get<{ Params: { id: string } }>("/routines/jobs/:id", async (request, reply) => {
    const status = await getJobStatus(request.params.id);
    if (!status) return reply.code(404).send({ error: "job não encontrado" });
    return reply.send(status);
  });
}
