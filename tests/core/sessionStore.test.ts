import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/roadmap.md (D-01), data-delta.md § 1.
 * App DB simulada em memória (mesmo padrão de tests/core/jobRunner.test.ts). A expiração só é
 * aplicada se a query REAL a incluir no WHERE — a mock simula o que um banco real faria com a
 * cláusula que o código mandar, em vez de impor a regra por conta própria.
 */

interface FakeSession {
  id: string;
  user_id: string;
  expires_at: Date;
}

const sessions = new Map<string, FakeSession>();
const users = new Map<string, { id: string; username: string }>();

vi.mock("../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as any[];
      if (sql.includes("INSERT INTO app_sessions")) {
        const hours = sql.includes("INTERVAL 2 HOUR") ? 2 : 0;
        sessions.set(p[0], { id: p[0], user_id: p[1], expires_at: new Date(Date.now() + hours * 3600_000) });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("DELETE FROM app_sessions")) {
        const existed = sessions.delete(p[0]);
        return [{ affectedRows: existed ? 1 : 0 }];
      }
      if (sql.includes("FROM app_sessions")) {
        const s = sessions.get(p[0]);
        const checksExpiry = sql.includes("expires_at > NOW()");
        if (!s || (checksExpiry && s.expires_at.getTime() <= Date.now())) return [[]];
        const u = users.get(s.user_id)!;
        return [[{ user_id: s.user_id, username: u.username, expires_at: s.expires_at }]];
      }
      throw new Error(`SQL não mockado neste teste: ${sql}`);
    }),
  }),
}));

const { createSession, getSession, deleteSession } = await import("../../src/core/sessionStore.js");

beforeEach(() => {
  sessions.clear();
  users.clear();
  users.set("u1", { id: "u1", username: "operador" });
});

describe("sessionStore", () => {
  it("cria sessão com token opaco de 64 caracteres hex e expiração de 2h", async () => {
    const { id } = await createSession("u1");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    const stored = sessions.get(id)!;
    const ttl = stored.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(2 * 3600_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(2 * 3600_000);
  });

  it("cria tokens diferentes a cada login", async () => {
    const a = await createSession("u1");
    const b = await createSession("u1");
    expect(a.id).not.toBe(b.id);
  });

  it("lê uma sessão válida com a identidade do usuário", async () => {
    const { id } = await createSession("u1");
    expect(await getSession(id)).toEqual({ userId: "u1", username: "operador" });
  });

  it("trata sessão expirada como inválida", async () => {
    const { id } = await createSession("u1");
    sessions.get(id)!.expires_at = new Date(Date.now() - 1000);
    expect(await getSession(id)).toBeNull();
  });

  it("trata token inexistente como inválido", async () => {
    expect(await getSession("nao-existe")).toBeNull();
  });

  it("deleteSession remove a sessão (logout)", async () => {
    const { id } = await createSession("u1");
    await deleteSession(id);
    expect(await getSession(id)).toBeNull();
  });
});
