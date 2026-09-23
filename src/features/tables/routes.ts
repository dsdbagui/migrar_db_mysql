import type { FastifyInstance } from "fastify";
import { getProfile, resolveForConnection } from "../../core/credentialVault.js";
import { createJob, runJob, getJobStatus } from "../../core/jobRunner.js";
import { previewTables, runTablesJob, type TablesJobParams } from "./service.js";
import { logger } from "../../core/logger.js";

/**
 * _reversa_forward/005-perfil-conexao-por-usuario (D-06, RN-04): preview e criação de job recebem
 * o banco de origem/destino no corpo (o perfil não guarda mais banco), os perfis precisam ser do
 * usuário da sessão (404 caso contrário), e createdBy vem da sessão — não mais do corpo.
 */

interface TablesPreviewBody {
  sourceProfileId: string;
  sourceDatabase: string;
  select: TablesJobParams["select"];
  forceInnodb?: boolean;
}

interface CreateTablesJobBody extends TablesJobParams {
  sourceProfileId: string;
  targetProfileId: string;
  sourceDatabase: string;
  targetDatabase: string;
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function registerTablesRoutes(app: FastifyInstance): void {
  app.post<{ Body: TablesPreviewBody }>("/tables/preview", async (request, reply) => {
    const { sourceProfileId, sourceDatabase, select, forceInnodb } = request.body ?? {};
    if (!isFilled(sourceDatabase)) return reply.code(400).send({ error: "sourceDatabase é obrigatório" });
    if (!(await getProfile(sourceProfileId, request.userId))) {
      return reply.code(404).send({ error: "perfil não encontrado" });
    }
    const sourceParams = await resolveForConnection(sourceProfileId, sourceDatabase.trim());
    const preview = await previewTables(sourceParams, { select, forceInnodb: forceInnodb ?? false });
    return reply.send({ items: preview });
  });

  app.post<{ Body: CreateTablesJobBody }>("/tables/jobs", async (request, reply) => {
    const body = request.body ?? ({} as CreateTablesJobBody);
    if (!isFilled(body.sourceDatabase) || !isFilled(body.targetDatabase)) {
      return reply.code(400).send({ error: "sourceDatabase e targetDatabase são obrigatórios" });
    }
    const [source, target] = await Promise.all([
      getProfile(body.sourceProfileId, request.userId),
      getProfile(body.targetProfileId, request.userId),
    ]);
    if (!source || !target) return reply.code(404).send({ error: "perfil não encontrado" });

    const jobId = await createJob({
      feature: "tables",
      params: {
        select: body.select,
        copyData: body.copyData,
        skipCreate: body.skipCreate,
        forceInnodb: body.forceInnodb,
        dropExisting: body.dropExisting,
        filters: body.filters,
        columnDefaults: body.columnDefaults,
        restoreRemovedFks: body.restoreRemovedFks,
        createDatabaseIfMissing: body.createDatabaseIfMissing,
      } satisfies TablesJobParams,
      sourceProfileId: body.sourceProfileId,
      targetProfileId: body.targetProfileId,
      sourceDatabase: body.sourceDatabase.trim(),
      targetDatabase: body.targetDatabase.trim(),
      createdBy: request.username,
    });

    runJob(jobId, runTablesJob).catch((err) => {
      logger.error(`Job de tabelas ${jobId} falhou`, { error: String(err) });
    });

    return reply.code(202).send({ id: jobId });
  });

  app.get<{ Params: { id: string } }>("/tables/jobs/:id", async (request, reply) => {
    const status = await getJobStatus(request.params.id);
    if (!status) return reply.code(404).send({ error: "job não encontrado" });
    return reply.send(status);
  });
}
