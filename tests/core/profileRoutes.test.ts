import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/interfaces/connection-profiles.md,
 * requirements.md (RN-02, RF-06, RF-07).
 * App DB simulada em memória. O filtro por dono só é aplicado se a query REAL tiver
 * "user_id = ?" no WHERE — a mock interpreta as condições "coluna = ?" que o código mandar,
 * em vez de impor o escopo privado por conta própria (o que mascararia a ausência do filtro).
 */

process.env.CREDENTIAL_VAULT_KEY = "11".repeat(32);

interface Row {
  id: string;
  user_id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password_enc: Buffer;
  created_at: Date;
  updated_at: Date;
}

const rows = new Map<string, Row>();
const sessions = new Map<string, { userId: string; username: string }>();

function whereFilter(sql: string, params: any[]): (r: Row) => boolean {
  const where = sql.split(/WHERE/i)[1] ?? "";
  const columns = [...where.matchAll(/(\w+) = \?/g)].map((m) => m[1] as keyof Row);
  const offset = params.length - columns.length;
  return (r) => columns.every((col, i) => r[col] === params[offset + i]);
}

vi.mock("../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as any[];
      if (sql.includes("INSERT INTO connection_profiles")) {
        const cols = sql.match(/\(([^)]+)\)/)![1]!.split(",").map((c) => c.trim());
        const row = Object.fromEntries(cols.map((c, i) => [c, p[i]])) as unknown as Row;
        // uq_connection_profiles_user_label (user_id, label)
        if ([...rows.values()].some((r) => r.user_id === row.user_id && r.label === row.label)) {
          throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
        }
        row.created_at = new Date();
        row.updated_at = new Date();
        rows.set(row.id, row);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SELECT") && sql.includes("FROM connection_profiles")) {
        return [[...rows.values()].filter(whereFilter(sql, p))];
      }
      if (sql.includes("DELETE FROM connection_profiles")) {
        const match = [...rows.values()].filter(whereFilter(sql, p));
        match.forEach((r) => rows.delete(r.id));
        return [{ affectedRows: match.length }];
      }
      throw new Error(`SQL não mockado neste teste: ${sql}`);
    }),
  }),
}));

vi.mock("../../src/core/sessionStore.js", () => ({
  SESSION_TTL_SECONDS: 7200,
  createSession: vi.fn(),
  getSession: async (id: string) => sessions.get(id) ?? null,
  deleteSession: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");

const A = { session: "tok-a" };
const B = { session: "tok-b" };

beforeEach(() => {
  rows.clear();
  sessions.clear();
  sessions.set("tok-a", { userId: "user-a", username: "ana" });
  sessions.set("tok-b", { userId: "user-b", username: "bruno" });
});

async function createAs(cookies: Record<string, string>, label: string) {
  const app = buildApp();
  return app.inject({
    method: "POST",
    url: "/connection-profiles",
    cookies,
    payload: { label, host: " db.local ", port: 3306, user: "root", password: "s3cret" },
  });
}

describe("POST /connection-profiles", () => {
  it("grava o dono a partir da sessão, sem campo de banco na resposta", async () => {
    const res = await createAs(A, "prod");
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(rows.get(body.id)!.user_id).toBe("user-a");
    expect(body).not.toHaveProperty("databaseName");
    expect(body).not.toHaveProperty("password");
    expect(body.host).toBe("db.local");
  });

  it("ignora um user_id/userId enviado no corpo — o dono vem só da sessão", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/connection-profiles",
      cookies: A,
      payload: { label: "x", host: "h", user: "u", password: "p", userId: "user-b", user_id: "user-b" },
    });
    expect(res.statusCode).toBe(201);
    expect(rows.get(res.json().id)!.user_id).toBe("user-a");
  });
});

describe("rótulo único por dono", () => {
  it("o mesmo rótulo é aceito para usuários diferentes e recusado (409) para o mesmo dono", async () => {
    expect((await createAs(A, "prod")).statusCode).toBe(201);
    expect((await createAs(B, "prod")).statusCode).toBe(201);
    const dup = await createAs(A, "prod");
    expect(dup.statusCode).toBe(409);
  });
});

describe("escopo privado (RN-02)", () => {
  it("GET /connection-profiles só lista os perfis do usuário da sessão", async () => {
    await createAs(A, "da-ana");
    await createAs(B, "do-bruno");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/connection-profiles", cookies: A });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((p: { label: string }) => p.label)).toEqual(["da-ana"]);
  });

  it("GET /connection-profiles/:id de perfil de outro usuário: 404", async () => {
    const created = (await createAs(A, "da-ana")).json();
    const app = buildApp();
    const asOwner = await app.inject({ method: "GET", url: `/connection-profiles/${created.id}`, cookies: A });
    const asOther = await app.inject({ method: "GET", url: `/connection-profiles/${created.id}`, cookies: B });
    expect(asOwner.statusCode).toBe(200);
    expect(asOther.statusCode).toBe(404);
  });

  it("DELETE /connection-profiles/:id de perfil de outro usuário: 404 e o perfil continua existindo", async () => {
    const created = (await createAs(A, "da-ana")).json();
    const app = buildApp();
    const asOther = await app.inject({ method: "DELETE", url: `/connection-profiles/${created.id}`, cookies: B });
    expect(asOther.statusCode).toBe(404);
    expect(rows.has(created.id)).toBe(true);

    const asOwner = await app.inject({ method: "DELETE", url: `/connection-profiles/${created.id}`, cookies: A });
    expect(asOwner.statusCode).toBe(204);
    expect(rows.has(created.id)).toBe(false);
  });
});
