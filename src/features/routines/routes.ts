import type { FastifyInstance } from "fastify";
import { resolveForConnection } from "../../core/credentialVault.js";
import { createJob, runJob, getJobStatus } from "../../core/jobRunner.js";
import { previewRoutines, runRoutinesJob, type RoutinesJobParams } from "./service.js";
import { logger } from "../../core/logger.js";

interface CreateRoutinesJobBody {
  sourceProfileId: string;
  targetProfileId: string;
  select: "all" | string[];
  newDefiner?: string;
  dropExisting?: boolean;
  createdBy?: string;
}

export function registerRoutinesRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateRoutinesJobBody }>("/routines/preview", async (request, reply) => {
    const { sourceProfileId, select, newDefiner } = request.body;
    const sourceParams = await resolveForConnection(sourceProfileId);
    const params: RoutinesJobParams = { select, newDefiner, dropExisting: false };
    const preview = await previewRoutines(sourceParams, params);
    return reply.send({ items: preview });
  });

  app.post<{ Body: CreateRoutinesJobBody }>("/routines/jobs", async (request, reply) => {
    const body = request.body;
    const jobId = await createJob({
      feature: "routines",
      params: {
        select: body.select,
        newDefiner: body.newDefiner,
        dropExisting: body.dropExisting ?? true,
      } satisfies RoutinesJobParams,
      sourceProfileId: body.sourceProfileId,
      targetProfileId: body.targetProfileId,
      createdBy: body.createdBy ?? "unknown",
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
