import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/interfaces/preview.md,
 * interfaces/criacao-de-job.md, requirements.md (RN-04, RF-10, RF-12).
 * Mocks no limite dos módulos: credentialVault (perfis/dono), jobRunner (persistência do job),
 * service (pipeline real de rotinas, que abriria conexão MySQL) e sessionStore.
 */

const profiles = new Map<string, { id: string; ownerId: string }>();
const sessions = new Map<string, { userId: string; username: string }>();

const createJob = vi.fn(async (_input: Record<string, unknown>) => "job-1");
const runJob = vi.fn(async () => {});
const resolveForConnection = vi.fn(async (_id: string, database?: string) => ({
  host: "h",
  port: 3306,
  user: "u",
  password: "p",
  database,
}));
const previewRoutines = vi.fn(async () => [{ name: "proc1", issues: [] }]);

vi.mock("../../../src/core/credentialVault.js", () => ({
  getProfile: async (id: string, userId: string) => {
    const p = profiles.get(id);
    return p && p.ownerId === userId ? { id } : null;
  },
  resolveForConnection: (id: string, database?: string) => resolveForConnection(id, database),
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

vi.mock("../../../src/core/jobRunner.js", () => ({
  createJob: (input: Record<string, unknown>) => createJob(input),
  runJob: () => runJob(),
  getJobStatus: vi.fn(),
}));

vi.mock("../../../src/features/routines/service.js", () => ({
  previewRoutines: (...args: unknown[]) => previewRoutines(...(args as [])),
  runRoutinesJob: vi.fn(),
}));

vi.mock("../../../src/core/sessionStore.js", () => ({
  SESSION_TTL_SECONDS: 7200,
  createSession: vi.fn(),
  getSession: async (id: string) => sessions.get(id) ?? null,
  deleteSession: vi.fn(),
}));

const { buildApp } = await import("../../../src/app.js");

const ANA = { session: "tok-ana" };

beforeEach(() => {
  profiles.clear();
  sessions.clear();
  createJob.mockClear();
  resolveForConnection.mockClear();
  previewRoutines.mockClear();
  sessions.set("tok-ana", { userId: "user-ana", username: "ana" });
  profiles.set("src", { id: "src", ownerId: "user-ana" });
  profiles.set("dst", { id: "dst", ownerId: "user-ana" });
  profiles.set("alheio", { id: "alheio", ownerId: "user-bruno" });
});

const jobBody = {
  sourceProfileId: "src",
  targetProfileId: "dst",
  sourceDatabase: "origem_a",
  targetDatabase: "destino_a",
  select: "all",
  newDefiner: "app@%",
  dropExisting: true,
};

describe("POST /routines/preview", () => {
  it("conecta na origem usando o sourceDatabase do corpo", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/preview",
      cookies: ANA,
      payload: { sourceProfileId: "src", sourceDatabase: "origem_a", select: "all" },
    });
    expect(res.statusCode).toBe(200);
    expect(resolveForConnection).toHaveBeenCalledWith("src", "origem_a");
  });

  it("sem sourceDatabase: 400, sem abrir conexão", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/preview",
      cookies: ANA,
      payload: { sourceProfileId: "src", select: "all" },
    });
    expect(res.statusCode).toBe(400);
    expect(resolveForConnection).not.toHaveBeenCalled();
  });

  it("perfil de outro usuário: 404", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/preview",
      cookies: ANA,
      payload: { sourceProfileId: "alheio", sourceDatabase: "x", select: "all" },
    });
    expect(res.statusCode).toBe(404);
    expect(resolveForConnection).not.toHaveBeenCalled();
  });
});

describe("POST /routines/jobs", () => {
  it("202, grava sourceDatabase/targetDatabase e createdBy da sessão (não do corpo)", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/jobs",
      cookies: ANA,
      payload: { ...jobBody, createdBy: "forjado" },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ id: "job-1" });
    const input = createJob.mock.calls[0]![0];
    expect(input).toMatchObject({
      feature: "routines",
      sourceProfileId: "src",
      targetProfileId: "dst",
      sourceDatabase: "origem_a",
      targetDatabase: "destino_a",
      createdBy: "ana",
    });
  });

  it("mesmo par de perfis com bancos diferentes gera dois jobs, cada um com o seu banco", async () => {
    const app = buildApp();
    await app.inject({ method: "POST", url: "/routines/jobs", cookies: ANA, payload: jobBody });
    await app.inject({
      method: "POST",
      url: "/routines/jobs",
      cookies: ANA,
      payload: { ...jobBody, sourceDatabase: "origem_b", targetDatabase: "destino_b" },
    });
    expect(createJob.mock.calls.map((c) => [c[0].sourceDatabase, c[0].targetDatabase])).toEqual([
      ["origem_a", "destino_a"],
      ["origem_b", "destino_b"],
    ]);
  });

  it.each(["sourceDatabase", "targetDatabase"])("sem %s: 400, nenhum job criado", async (field) => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/jobs",
      cookies: ANA,
      payload: { ...jobBody, [field]: "  " },
    });
    expect(res.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
  });

  it("perfil de destino de outro usuário: 404, nenhum job criado", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/routines/jobs",
      cookies: ANA,
      payload: { ...jobBody, targetProfileId: "alheio" },
    });
    expect(res.statusCode).toBe(404);
    expect(createJob).not.toHaveBeenCalled();
  });

  it("sem sessão: 401", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/routines/jobs", payload: jobBody });
    expect(res.statusCode).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
  });
});
