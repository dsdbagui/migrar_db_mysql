import type { FastifyInstance } from "fastify";
import { getAppDb } from "../../core/db/appDb.js";
import type { MigrationFeature, JobStatus } from "../../core/jobRunner.js";

/**
 * Endpoints transversais de job (cancelamento + listagem) — fora dos namespaces
 * `/routines`/`/tables`, mesmo raciocínio que já justificou `reports/` ser transversal
 * (`migration_jobs` é genérico por `job.id`, independente da feature).
 * Contratos completos em `_reversa_forward/003-cancelamento-de-job/interfaces/cancelamento-de-job.md`
 * e `_reversa_forward/004-historico-de-jobs/interfaces/get-jobs.md`.
 */

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const VALID_FEATURES = new Set<MigrationFeature>(["routines", "tables", "config", "reports", "collation_fix"]);
const VALID_STATUSES = new Set<JobStatus>(["pending", "running", "completed", "failed", "cancelled"]);

async function fetchJobStatus(jobId: string): Promise<string | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT status FROM migration_jobs WHERE id = ?", [jobId]);
  return (rows as any[])[0]?.status ?? null;
}

interface JobListItem {
  id: string;
  feature: MigrationFeature;
  status: JobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string;
  errorMessage: string | null;
  sourceProfileLabel: string | null;
  targetProfileLabel: string | null;
  createdAt: string;
}

/**
 * Lista os 50 jobs mais recentes por created_at DESC (RF-01), com os labels de
 * connection_profiles já resolvidos via LEFT JOIN (RF-02) — LEFT, não INNER, porque
 * source_profile_id é NULL para jobs de collation_fix (banco único, sem excluí-los da
 * listagem). Filtros opcionais reaproveitam ix_migration_jobs_feature_status (001_init.sql:30).
 */
async function listJobs(filters: { feature?: string; status?: string }): Promise<JobListItem[]> {
  const db = getAppDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.feature) {
    conditions.push("j.feature = ?");
    params.push(filters.feature);
  }
  if (filters.status) {
    conditions.push("j.status = ?");
    params.push(filters.status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await db.query<any[]>(
    `SELECT j.id, j.feature, j.status, j.started_at, j.finished_at, j.created_by,
            j.error_message, j.created_at,
            sp.label AS source_profile_label, tp.label AS target_profile_label
     FROM migration_jobs j
     LEFT JOIN connection_profiles sp ON sp.id = j.source_profile_id
     LEFT JOIN connection_profiles tp ON tp.id = j.target_profile_id
     ${whereClause}
     ORDER BY j.created_at DESC
     LIMIT 50`,
    params,
  );

  return (rows as any[]).map((r) => ({
    id: r.id,
    feature: r.feature,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdBy: r.created_by,
    errorMessage: r.error_message,
    sourceProfileLabel: r.source_profile_label,
    targetProfileLabel: r.target_profile_label,
    createdAt: r.created_at,
  }));
}

export function registerJobRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/jobs/:id/cancel", async (request, reply) => {
    const jobId = request.params.id;
    const status = await fetchJobStatus(jobId);

    if (status === null) {
      return reply.code(404).send({ error: "job não encontrado" });
    }
    if (TERMINAL_STATUSES.has(status)) {
      return reply.code(409).send({ error: `job já está em status terminal (${status})` });
    }

    const db = getAppDb();
    await db.query(
      `UPDATE migration_jobs SET status = 'cancelled', finished_at = NOW() WHERE id = ? AND status IN ('pending', 'running')`,
      [jobId],
    );

    return reply.code(200).send({ id: jobId, status: "cancelled" });
  });

  app.get<{ Querystring: { feature?: string; status?: string } }>("/jobs", async (request, reply) => {
    const { feature, status } = request.query;

    if (feature && !VALID_FEATURES.has(feature as MigrationFeature)) {
      return reply.code(400).send({ error: `feature inválida: ${feature}` });
    }
    if (status && !VALID_STATUSES.has(status as JobStatus)) {
      return reply.code(400).send({ error: `status inválido: ${status}` });
    }

    return reply.send(await listJobs({ feature, status }));
  });
}
