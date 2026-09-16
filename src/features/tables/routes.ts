import type { FastifyInstance } from "fastify";
import { resolveForConnection } from "../../core/credentialVault.js";
import { createJob, runJob, getJobStatus } from "../../core/jobRunner.js";
import { previewTables, runTablesJob, type TablesJobParams } from "./service.js";
import { logger } from "../../core/logger.js";

interface CreateTablesJobBody extends TablesJobParams {
  sourceProfileId: string;
  targetProfileId: string;
  createdBy?: string;
}

export function registerTablesRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateTablesJobBody }>("/tables/preview", async (request, reply) => {
    const { sourceProfileId, select, forceInnodb } = request.body;
    const sourceParams = await resolveForConnection(sourceProfileId);
    const preview = await previewTables(sourceParams, { select, forceInnodb });
    return reply.send({ items: preview });
  });

  app.post<{ Body: CreateTablesJobBody }>("/tables/jobs", async (request, reply) => {
    const body = request.body;
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
      } satisfies TablesJobParams,
      sourceProfileId: body.sourceProfileId,
      targetProfileId: body.targetProfileId,
      createdBy: body.createdBy ?? "unknown",
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
