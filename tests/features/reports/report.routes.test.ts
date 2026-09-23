import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: interfaces/relatorio-de-job.md (RF-10, target_business_rules.md#BR-MIGRAR-016).
 * Testa o contrato HTTP do endpoint de relatório sem depender de MySQL real — a App DB é
 * simulada em memória, dispachando por trecho do SQL (mesmo padrão que `job_items`/
 * `migration_jobs`/`job_reports` reais, ver `src/core/db/migrations/001_init.sql`).
 */

interface FakeJob {
  id: string;
  feature: string;
  status: string;
  params_json: Record<string, unknown>;
  source_profile_id: string | null;
  target_profile_id: string | null;
  source_database?: string | null;
  target_database?: string;
}

interface FakeItem {
  item_type: "routine" | "table";
  name: string;
  applied: 0 | 1;
  skipped: 0 | 1;
  apply_error: string | null;
  copy_error: string | null;
  rows_copied: number | null;
  ddl_original: string | null;
  ddl_fixed: string | null;
  issues_json: unknown[];
}

const jobs = new Map<string, FakeJob>();
const itemsByJob = new Map<string, FakeItem[]>();
const reportsByJob = new Map<
  string,
  { report_json: unknown; report_html: string; migration_sql: string; retry_sql: string | null }
>();

function reset(): void {
  jobs.clear();
  itemsByJob.clear();
  reportsByJob.clear();
}

vi.mock("../../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as any[];

      if (sql.includes("SELECT status FROM migration_jobs")) {
        const job = jobs.get(p[0]);
        return [job ? [{ status: job.status }] : []];
      }

      // _reversa_forward/005-perfil-conexao-por-usuario: o banco vem das colunas do job, não mais
      // de connection_profiles.database_name (removida em 005_*.sql).
      if (sql.includes("FROM migration_jobs j") && sql.includes("WHERE j.id = ?")) {
        if (sql.includes("database_name")) throw new Error("connection_profiles.database_name não existe mais");
        const job = jobs.get(p[0]);
        if (!job) return [[]];
        return [
          [
            {
              id: job.id,
              feature: job.feature,
              status: job.status,
              params_json: job.params_json,
              source_db: job.source_database ?? null,
              destination_db: job.target_database ? job.target_database : null,
            },
          ],
        ];
      }

      if (sql.includes("FROM job_items WHERE job_id")) {
        return [itemsByJob.get(p[0]) ?? []];
      }

      if (sql.includes("SELECT id FROM job_reports")) {
        return [reportsByJob.has(p[0]) ? [{ id: "existing" }] : []];
      }

      if (sql.startsWith("INSERT INTO job_reports")) {
        const [, jobId, reportJson, reportHtml, migrationSql, retrySql] = p;
        reportsByJob.set(jobId, {
          report_json: JSON.parse(reportJson),
          report_html: reportHtml,
          migration_sql: migrationSql,
          retry_sql: retrySql,
        });
        return [{}];
      }

      if (sql.startsWith("UPDATE job_reports")) {
        const [reportJson, reportHtml, migrationSql, retrySql, jobId] = p;
        reportsByJob.set(jobId, {
          report_json: JSON.parse(reportJson),
          report_html: reportHtml,
          migration_sql: migrationSql,
          retry_sql: retrySql,
        });
        return [{}];
      }

      if (sql.includes("FROM job_reports WHERE job_id")) {
        const row = reportsByJob.get(p[0]);
        return [row ? [row] : []];
      }

      throw new Error(`SQL não mockado neste teste: ${sql}`);
    }),
  }),
}));

// _reversa_forward/005-perfil-conexao-por-usuario (D-08): toda rota passou a exigir sessão —
// sessão simulada no limite de sessionStore, e todo inject carrega o cookie via AUTH.
vi.mock("../../../src/core/sessionStore.js", () => ({
  SESSION_TTL_SECONDS: 7200,
  createSession: vi.fn(),
  getSession: async (id: string) => (id === "tok-teste" ? { userId: "u-teste", username: "operador" } : null),
  deleteSession: vi.fn(),
}));
const AUTH = { session: "tok-teste" };

const { buildApp } = await import("../../../src/app.js");

beforeEach(() => {
  reset();
});

describe("POST /jobs/:id/report", () => {
  it("retorna 404 para job inexistente", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/inexistente/report" });
    expect(res.statusCode).toBe(404);
  });

  it("retorna 409 quando o job ainda está em execução", async () => {
    jobs.set("job-running", {
      id: "job-running",
      feature: "routines",
      status: "running",
      params_json: {},
      source_profile_id: null,
      target_profile_id: null,
    });
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-running/report" });
    expect(res.statusCode).toBe(409);
  });

  it("gera (201) e depois regenera (200) o relatório de um job concluído", async () => {
    jobs.set("job-ok", {
      id: "job-ok",
      feature: "routines",
      status: "completed",
      params_json: {},
      source_profile_id: null,
      target_profile_id: null,
    });
    itemsByJob.set("job-ok", [
      {
        item_type: "routine",
        name: "sp_exemplo",
        applied: 1,
        skipped: 0,
        apply_error: null,
        copy_error: null,
        rows_copied: null,
        ddl_original: "CREATE PROCEDURE sp_exemplo() BEGIN SELECT 1; END",
        ddl_fixed: "CREATE PROCEDURE sp_exemplo() BEGIN SELECT 1; END",
        issues_json: [],
      },
    ]);

    const app = buildApp();
    const first = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-ok/report" });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-ok/report" });
    expect(second.statusCode).toBe(200);
  });
});

describe("GET /jobs/:id/report", () => {
  it("retorna 400 para format inválido", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-ok/report?format=xml" });
    expect(res.statusCode).toBe(400);
  });

  it("retorna 404 para job inexistente", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/inexistente/report" });
    expect(res.statusCode).toBe(404);
  });

  it("retorna 404 quando o relatório ainda não foi gerado", async () => {
    jobs.set("job-sem-relatorio", {
      id: "job-sem-relatorio",
      feature: "tables",
      status: "completed",
      params_json: {},
      source_profile_id: null,
      target_profile_id: null,
    });
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-sem-relatorio/report" });
    expect(res.statusCode).toBe(404);
  });

  it("retorna o relatório em json/html/sql após POST, e 404 em retry quando não há erro", async () => {
    jobs.set("job-completo", {
      id: "job-completo",
      feature: "tables",
      status: "completed",
      params_json: { copyData: true },
      source_profile_id: null,
      target_profile_id: null,
      source_database: "origem_a",
      target_database: "destino_a",
    });
    itemsByJob.set("job-completo", [
      {
        item_type: "table",
        name: "clientes",
        applied: 1,
        skipped: 0,
        apply_error: null,
        copy_error: null,
        rows_copied: 42,
        ddl_original: "CREATE TABLE clientes (id INT) ENGINE=InnoDB",
        ddl_fixed: "CREATE TABLE clientes (id INT) ENGINE=InnoDB",
        issues_json: [],
      },
    ]);

    const app = buildApp();
    await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-completo/report" });

    const json = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-completo/report?format=json" });
    expect(json.statusCode).toBe(200);
    const body = JSON.parse(json.body);
    expect(body.tables.total).toBe(1);
    expect(body.tables.rowsCopied).toBe(42);
    expect(body.sourceDb).toBe("origem_a");
    expect(body.destinationDb).toBe("destino_a");

    const html = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-completo/report?format=html" });
    expect(html.statusCode).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");

    const sql = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-completo/report?format=sql" });
    expect(sql.statusCode).toBe(200);
    expect(sql.body).toContain("CREATE TABLE clientes");

    const retry = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-completo/report?format=retry" });
    expect(retry.statusCode).toBe(404);
  });

  it("retorna sql de retry quando há item com erro", async () => {
    jobs.set("job-com-erro", {
      id: "job-com-erro",
      feature: "tables",
      status: "failed",
      params_json: {},
      source_profile_id: null,
      target_profile_id: null,
    });
    itemsByJob.set("job-com-erro", [
      {
        item_type: "table",
        name: "pedidos",
        applied: 0,
        skipped: 0,
        apply_error: "duplicate key",
        copy_error: null,
        rows_copied: null,
        ddl_original: "CREATE TABLE pedidos (id INT) ENGINE=InnoDB",
        ddl_fixed: "CREATE TABLE pedidos (id INT) ENGINE=InnoDB",
        issues_json: [],
      },
    ]);

    const app = buildApp();
    await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-com-erro/report" });

    const retry = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs/job-com-erro/report?format=retry" });
    expect(retry.statusCode).toBe(200);
    expect(retry.body).toContain("DROP TABLE IF EXISTS `pedidos`");
  });
});
