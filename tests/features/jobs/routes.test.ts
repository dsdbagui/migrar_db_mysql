import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/003-cancelamento-de-job/interfaces/cancelamento-de-job.md (D-04).
 * spec-id: _reversa_forward/004-historico-de-jobs/interfaces/get-jobs.md (D-01, D-03, D-04).
 * Testa os contratos HTTP transversais de src/features/jobs/routes.ts sem depender de MySQL
 * real — mesmo padrão de tests/features/reports/report.routes.test.ts (App DB simulada em
 * memória).
 */

interface FakeJob {
  id: string;
  status: string;
  feature?: string;
  createdAt?: string;
  createdBy?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  sourceProfileId?: string | null;
  targetProfileId?: string | null;
}

interface FakeProfile {
  id: string;
  label: string;
}

const jobs = new Map<string, FakeJob>();
const profiles = new Map<string, FakeProfile>();

function reset(): void {
  jobs.clear();
  profiles.clear();
}

vi.mock("../../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as any[];

      if (sql.includes("SELECT status FROM migration_jobs WHERE id")) {
        const job = jobs.get(p[0]);
        return [job ? [{ status: job.status }] : []];
      }

      if (sql.includes("UPDATE migration_jobs") && sql.includes("SET status = 'cancelled'")) {
        const job = jobs.get(p[p.length - 1]);
        let affectedRows = 0;
        if (job && (job.status === "pending" || job.status === "running")) {
          job.status = "cancelled";
          affectedRows = 1;
        }
        return [{ affectedRows }];
      }

      if (sql.includes("FROM migration_jobs j")) {
        let result = [...jobs.values()];
        let paramIdx = 0;
        if (sql.includes("j.feature = ?")) {
          result = result.filter((j) => j.feature === p[paramIdx]);
          paramIdx++;
        }
        if (sql.includes("j.status = ?")) {
          result = result.filter((j) => j.status === p[paramIdx]);
          paramIdx++;
        }
        result.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        result = result.slice(0, 50);
        const rows = result.map((j) => ({
          id: j.id,
          feature: j.feature,
          status: j.status,
          started_at: j.startedAt ?? null,
          finished_at: j.finishedAt ?? null,
          created_by: j.createdBy ?? "unknown",
          error_message: j.errorMessage ?? null,
          created_at: j.createdAt,
          source_profile_label: j.sourceProfileId ? profiles.get(j.sourceProfileId)?.label ?? null : null,
          target_profile_label: j.targetProfileId ? profiles.get(j.targetProfileId)?.label ?? null : null,
        }));
        return [rows];
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

describe("POST /jobs/:id/cancel", () => {
  it("retorna 404 para job inexistente", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/inexistente/cancel" });
    expect(res.statusCode).toBe(404);
  });

  it("cancela (200) um job pending", async () => {
    jobs.set("job-pending", { id: "job-pending", status: "pending" });
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-pending/cancel" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "job-pending", status: "cancelled" });
    expect(jobs.get("job-pending")!.status).toBe("cancelled");
  });

  it("cancela (200) um job running", async () => {
    jobs.set("job-running", { id: "job-running", status: "running" });
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-running/cancel" });
    expect(res.statusCode).toBe(200);
    expect(jobs.get("job-running")!.status).toBe("cancelled");
  });

  it.each(["completed", "failed", "cancelled"])(
    "retorna 409 para job já em status terminal (%s), sem alterar o status",
    async (status) => {
      jobs.set("job-terminal", { id: "job-terminal", status });
      const app = buildApp();
      const res = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-terminal/cancel" });
      expect(res.statusCode).toBe(409);
      expect(jobs.get("job-terminal")!.status).toBe(status);
    },
  );

  it("cancelar duas vezes seguidas: primeira 200, segunda 409", async () => {
    jobs.set("job-1", { id: "job-1", status: "running" });
    const app = buildApp();

    const first = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-1/cancel" });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ cookies: AUTH, method: "POST", url: "/jobs/job-1/cancel" });
    expect(second.statusCode).toBe(409);
  });
});

describe("GET /jobs", () => {
  it("retorna array vazio (200) quando não há jobs", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("retorna os jobs ordenados por created_at DESC, com labels de perfil resolvidos via JOIN", async () => {
    profiles.set("src-1", { id: "src-1", label: "Produção MySQL 5.7" });
    profiles.set("dst-1", { id: "dst-1", label: "Homologação MySQL 8.0" });
    jobs.set("job-old", {
      id: "job-old",
      status: "completed",
      feature: "tables",
      createdAt: "2026-09-20T10:00:00.000Z",
      sourceProfileId: "src-1",
      targetProfileId: "dst-1",
    });
    jobs.set("job-new", {
      id: "job-new",
      status: "failed",
      feature: "routines",
      createdAt: "2026-09-21T10:00:00.000Z",
      errorMessage: "DDL indisponível",
      sourceProfileId: "src-1",
      targetProfileId: "dst-1",
    });

    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((j: any) => j.id)).toEqual(["job-new", "job-old"]);
    expect(body[0]).toMatchObject({
      sourceProfileLabel: "Produção MySQL 5.7",
      targetProfileLabel: "Homologação MySQL 8.0",
      errorMessage: "DDL indisponível",
    });
  });

  it("inclui job de collation_fix (sem source_profile_id) com sourceProfileLabel null, em vez de excluí-lo", async () => {
    profiles.set("dst-1", { id: "dst-1", label: "Homologação MySQL 8.0" });
    jobs.set("job-collation", {
      id: "job-collation",
      status: "completed",
      feature: "collation_fix",
      createdAt: "2026-09-21T10:00:00.000Z",
      sourceProfileId: null,
      targetProfileId: "dst-1",
    });

    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs" });
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ sourceProfileLabel: null, targetProfileLabel: "Homologação MySQL 8.0" });
  });

  it("nunca retorna mais de 50 itens", async () => {
    for (let i = 0; i < 60; i++) {
      jobs.set(`job-${i}`, {
        id: `job-${i}`,
        status: "completed",
        feature: "tables",
        createdAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
      });
    }
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs" });
    expect(res.json()).toHaveLength(50);
  });

  it("filtra por ?feature= e ?status=, reaproveitando o índice composto existente", async () => {
    jobs.set("job-a", { id: "job-a", status: "completed", feature: "tables", createdAt: "2026-09-21T10:00:00.000Z" });
    jobs.set("job-b", { id: "job-b", status: "failed", feature: "tables", createdAt: "2026-09-21T11:00:00.000Z" });
    jobs.set("job-c", {
      id: "job-c",
      status: "completed",
      feature: "routines",
      createdAt: "2026-09-21T12:00:00.000Z",
    });

    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs?feature=tables&status=completed" });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((j: any) => j.id)).toEqual(["job-a"]);
  });

  it("retorna 400 para valor de feature fora do enum aceito", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs?feature=nao-existe" });
    expect(res.statusCode).toBe(400);
  });

  it("retorna 400 para valor de status fora do enum aceito", async () => {
    const app = buildApp();
    const res = await app.inject({ cookies: AUTH, method: "GET", url: "/jobs?status=nao-existe" });
    expect(res.statusCode).toBe(400);
  });
});
