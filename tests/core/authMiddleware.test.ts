import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/interfaces/autenticacao.md § Middleware,
 * roadmap.md (D-08), requirements.md (RF-05).
 * Sessões simuladas no limite de sessionStore. O App DB é mockado para FALHAR em qualquer query:
 * uma requisição recusada pelo middleware nunca pode chegar a tocar a lógica de negócio da rota.
 */

const sessions = new Map<string, { userId: string; username: string }>();
const dbQuery = vi.fn(async (sql: string) => {
  throw new Error(`rota protegida chegou ao App DB sem sessão válida: ${sql}`);
});

vi.mock("../../src/core/db/appDb.js", () => ({ getAppDb: () => ({ query: dbQuery }) }));

vi.mock("../../src/core/sessionStore.js", () => ({
  SESSION_TTL_SECONDS: 7200,
  createSession: vi.fn(),
  getSession: async (id: string) => sessions.get(id) ?? null,
  deleteSession: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");

beforeEach(() => {
  sessions.clear();
  dbQuery.mockClear();
});

describe("middleware de autenticação", () => {
  it.each([
    ["GET", "/connection-profiles"],
    ["GET", "/connection-profiles/qualquer"],
    ["POST", "/routines/preview"],
    ["POST", "/tables/jobs"],
    ["GET", "/jobs"],
    ["POST", "/jobs/x/cancel"],
    ["GET", "/jobs/x/report"],
    ["POST", "/users"],
    ["POST", "/logout"],
  ])("%s %s sem cookie: 401 sem tocar o App DB", async (method, url) => {
    const app = buildApp();
    const res = await app.inject({ method: method as "GET" | "POST", url, payload: method === "POST" ? {} : undefined });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "não autenticado" });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("cookie com sessão inexistente ou expirada: 401", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/connection-profiles", cookies: { session: "expirada" } });
    expect(res.statusCode).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("/health continua acessível sem sessão", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("/login continua acessível sem sessão (não responde 401 do middleware)", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/login", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("sessão válida passa pelo middleware e chega à rota", async () => {
    sessions.set("tok-ok", { userId: "u1", username: "operador" });
    dbQuery.mockImplementationOnce(async () => [[]] as any);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/connection-profiles", cookies: { session: "tok-ok" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("401 de rota protegida ainda leva cabeçalhos CORS (o frontend precisa ler o status para redirecionar ao login)", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/connection-profiles",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("preflight CORS (OPTIONS) não é bloqueado pelo middleware", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/connection-profiles",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "GET" },
    });
    expect(res.statusCode).toBe(204);
  });
});
