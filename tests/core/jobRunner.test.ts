import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/002-timeout-conexao-job/requirements.md (RF-04, D-03, D-04);
 * _reversa_forward/003-cancelamento-de-job/requirements.md (D-01, D-02).
 * Testa que runJob persiste `error_message` em migration_jobs no caminho de falha, que
 * getJobStatus devolve `errorMessage`, que `isCancelled()` reflete o status persistido, e
 * que os UPDATEs terminais de runJob nunca sobrescrevem um job já `cancelled` (D-02).
 * App DB simulada em memória (mesmo padrão de tests/features/reports/report.routes.test.ts);
 * credentialVault mockado no limite do módulo — a criptografia de senha não é o que este
 * teste verifica.
 */

interface FakeJob {
  id: string;
  feature: string;
  status: string;
  params_json: Record<string, unknown>;
  source_profile_id: string | null;
  target_profile_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

const jobs = new Map<string, FakeJob>();

function reset(): void {
  jobs.clear();
  jobs.set("job-1", {
    id: "job-1",
    feature: "tables",
    status: "pending",
    params_json: {},
    source_profile_id: null,
    target_profile_id: "profile-1",
    started_at: null,
    finished_at: null,
    error_message: null,
  });
}

vi.mock("../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT * FROM migration_jobs WHERE id")) {
        const job = jobs.get(params[0] as string);
        return [job ? [job] : []];
      }
      if (sql.includes("UPDATE migration_jobs SET status = 'running'")) {
        const job = jobs.get(params[0] as string);
        if (job) job.status = "running";
        return [{}];
      }
      if (sql.includes("UPDATE migration_jobs SET status = 'completed'")) {
        // D-02: só aplica a guarda de status = 'running' se a query REAL a incluir no WHERE —
        // simula fielmente o que um banco real faria com a cláusula que o código mandar,
        // em vez de a mock impor a regra por conta própria (o que mascararia a ausência do fix).
        const job = jobs.get(params[0] as string);
        const hasRunningGuard = sql.includes("status = 'running'");
        if (job && (!hasRunningGuard || job.status === "running")) job.status = "completed";
        return [{}];
      }
      if (sql.includes("UPDATE migration_jobs SET status = 'failed'")) {
        const job = jobs.get(params[params.length - 1] as string);
        const hasRunningGuard = sql.includes("status = 'running'");
        if (job && (!hasRunningGuard || job.status === "running")) {
          job.status = "failed";
          // T010: error_message é o penúltimo parâmetro quando a query o inclui.
          if (sql.includes("error_message")) job.error_message = params[0] as string;
        }
        return [{}];
      }
      if (sql.includes("SELECT status FROM migration_jobs WHERE id")) {
        const job = jobs.get(params[0] as string);
        return [job ? [{ status: job.status }] : []];
      }
      if (sql.includes("SELECT name FROM job_items")) {
        return [[]];
      }
      if (sql.includes("FROM job_items WHERE job_id")) {
        return [[]];
      }
      throw new Error(`Query não simulada no teste: ${sql}`);
    }),
  }),
}));

vi.mock("../../src/core/credentialVault.js", () => ({
  resolveForConnection: vi.fn(async () => ({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "x",
    database: "db",
  })),
}));

const { runJob, getJobStatus } = await import("../../src/core/jobRunner.js");

beforeEach(() => {
  reset();
});

describe("runJob — persistência de error_message no caminho de falha (RF-04, D-03)", () => {
  it("marca o job como failed e persiste a mensagem do erro quando o runner rejeita", async () => {
    await expect(
      runJob("job-1", async () => {
        throw new Error("timeout ao conectar à origem");
      }),
    ).rejects.toThrow("timeout ao conectar à origem");

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("failed");
    expect(job.error_message).toBe("timeout ao conectar à origem");
  });

  it("não altera error_message quando o job conclui com sucesso", async () => {
    await runJob("job-1", async () => {
      /* sucesso, nenhum item processado neste teste */
    });

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("completed");
    expect(job.error_message).toBeNull();
  });
});

describe("runJob — isCancelled() e guarda contra sobrescrever cancelamento (D-01, D-02)", () => {
  it("ctx.isCancelled() reflete o status persistido em migration_jobs", async () => {
    const seen: boolean[] = [];
    await runJob("job-1", async (ctx) => {
      seen.push(await ctx.isCancelled());
      const job = jobs.get("job-1")!;
      job.status = "cancelled";
      seen.push(await ctx.isCancelled());
      // Devolve o status para 'running' só para não interferir na asserção final deste teste
      // (o teste seguinte cobre o efeito de terminar com 'cancelled').
      job.status = "running";
    });
    expect(seen).toEqual([false, true]);
  });

  it("não sobrescreve para completed um job que foi cancelado enquanto o runner ainda rodava", async () => {
    await runJob("job-1", async () => {
      // Simula um POST /jobs/:id/cancel concorrente, persistido enquanto o runner está em voo.
      jobs.get("job-1")!.status = "cancelled";
    });

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("cancelled");
  });

  it("não sobrescreve para failed um job que foi cancelado enquanto o runner ainda rodava", async () => {
    await expect(
      runJob("job-1", async () => {
        jobs.get("job-1")!.status = "cancelled";
        throw new Error("erro depois do cancelamento");
      }),
    ).rejects.toThrow("erro depois do cancelamento");

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("cancelled");
    expect(job.error_message).toBeNull();
  });
});

describe("getJobStatus — exposição de errorMessage (D-04)", () => {
  it("devolve errorMessage null para um job sem falha", async () => {
    const status = await getJobStatus("job-1");
    expect(status?.errorMessage ?? null).toBeNull();
  });

  it("devolve a mensagem persistida para um job failed", async () => {
    const job = jobs.get("job-1")!;
    job.status = "failed";
    job.error_message = "conexão recusada pelo destino";

    const status = await getJobStatus("job-1");
    expect(status?.errorMessage).toBe("conexão recusada pelo destino");
  });
});
