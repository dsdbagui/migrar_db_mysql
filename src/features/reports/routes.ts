import type { FastifyInstance } from "fastify";
import { getAppDb } from "../../core/db/appDb.js";
import { logger } from "../../core/logger.js";
import { generateReport } from "./serializer.js";

/**
 * Endpoint transversal de relatório (RF-10, `target_business_rules.md#BR-MIGRAR-016`) —
 * fora dos namespaces `/routines` e `/tables` porque `migration_jobs`/`job_reports` já são
 * genéricos por `job.id`, independente da feature (ver `roadmap.md` D-03).
 * Contrato completo em `_reversa_forward/001-frontend-wizard-migracao-web/interfaces/relatorio-de-job.md`.
 */

const VALID_FORMATS = ["json", "html", "sql", "retry"] as const;
type ReportFormat = (typeof VALID_FORMATS)[number];

function isValidFormat(value: unknown): value is ReportFormat {
  return typeof value === "string" && (VALID_FORMATS as readonly string[]).includes(value);
}

async function fetchJobStatus(jobId: string): Promise<string | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT status FROM migration_jobs WHERE id = ?", [jobId]);
  return (rows as any[])[0]?.status ?? null;
}

interface JobReportRow {
  report_json: unknown;
  report_html: string;
  migration_sql: string;
  retry_sql: string | null;
}

async function fetchStoredReport(jobId: string): Promise<JobReportRow | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    "SELECT report_json, report_html, migration_sql, retry_sql FROM job_reports WHERE job_id = ?",
    [jobId],
  );
  return (rows as any[])[0] ?? null;
}

export function registerReportsRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/jobs/:id/report", async (request, reply) => {
    const jobId = request.params.id;
    const status = await fetchJobStatus(jobId);
    if (status === null) {
      return reply.code(404).send({ error: "job não encontrado" });
    }
    if (status !== "completed" && status !== "failed" && status !== "cancelled") {
      return reply.code(409).send({ error: "job ainda em execução" });
    }

    const report = await generateReport(jobId);
    if (!report) {
      // Corrida rara: job existia no fetchJobStatus mas sumiu até aqui — trate como 404.
      return reply.code(404).send({ error: "job não encontrado" });
    }

    const db = getAppDb();
    const [existing] = await db.query<any[]>("SELECT id FROM job_reports WHERE job_id = ?", [jobId]);
    const alreadyExisted = (existing as any[]).length > 0;

    if (alreadyExisted) {
      await db.query(
        `UPDATE job_reports SET report_json = ?, report_html = ?, migration_sql = ?, retry_sql = ? WHERE job_id = ?`,
        [JSON.stringify(report.reportJson), report.reportHtml, report.migrationSql, report.retrySql, jobId],
      );
    } else {
      const { randomUUID } = await import("node:crypto");
      await db.query(
        `INSERT INTO job_reports (id, job_id, report_json, report_html, migration_sql, retry_sql)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), jobId, JSON.stringify(report.reportJson), report.reportHtml, report.migrationSql, report.retrySql],
      );
    }

    logger.ok(`Relatório ${alreadyExisted ? "regenerado" : "gerado"} para job ${jobId}`);
    return reply.code(alreadyExisted ? 200 : 201).send({ jobId, generatedAt: report.reportJson.timestamp });
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/jobs/:id/report",
    async (request, reply) => {
      const jobId = request.params.id;
      const format = request.query.format ?? "json";
      if (!isValidFormat(format)) {
        return reply.code(400).send({ error: `format inválido, use um de: ${VALID_FORMATS.join(", ")}` });
      }

      const status = await fetchJobStatus(jobId);
      if (status === null) {
        return reply.code(404).send({ error: "job não encontrado" });
      }

      const stored = await fetchStoredReport(jobId);
      if (!stored) {
        return reply.code(404).send({ error: "relatório ainda não gerado — chame POST /jobs/:id/report primeiro" });
      }

      switch (format) {
        case "json":
          return reply.send(stored.report_json);
        case "html":
          return reply.type("text/html").send(stored.report_html);
        case "sql":
          return reply.type("text/plain").send(stored.migration_sql);
        case "retry":
          if (stored.retry_sql == null) {
            return reply.code(404).send({ error: "sem itens com erro — não há retry a oferecer" });
          }
          return reply.type("text/plain").send(stored.retry_sql);
      }
    },
  );
}
