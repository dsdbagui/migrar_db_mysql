import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/roadmap.md (D-04), requirements.md (RF-11).
 * resolveForConnection(id, database?) — o banco passa a vir da chamada (do job), não mais de
 * uma coluna do perfil. Cifragem real (AES-256-GCM) com chave de teste, App DB em memória.
 */

process.env.CREDENTIAL_VAULT_KEY = "22".repeat(32);

const rows = new Map<string, Record<string, unknown>>();

vi.mock("../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const p = params as any[];
      if (sql.includes("INSERT INTO connection_profiles")) {
        const cols = sql.match(/\(([^)]+)\)/)![1]!.split(",").map((c) => c.trim());
        rows.set(p[0], { ...Object.fromEntries(cols.map((c, i) => [c, p[i]])), created_at: new Date(), updated_at: new Date() });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("FROM connection_profiles WHERE id = ?")) {
        const row = rows.get(p[0]);
        const ownerOk = !sql.includes("user_id = ?") || row?.user_id === p[1];
        return [row && ownerOk ? [row] : []];
      }
      throw new Error(`SQL não mockado neste teste: ${sql}`);
    }),
  }),
}));

const { createProfile, resolveForConnection } = await import("../../src/core/credentialVault.js");

beforeEach(() => rows.clear());

describe("resolveForConnection(id, database?)", () => {
  it("banco informado na chamada é o banco da conexão", async () => {
    const profile = await createProfile({ userId: "u1", label: "prod", host: "h", port: 3306, user: "root", password: "s3cret" });
    const params = await resolveForConnection(profile.id, "banco_a");
    expect(params).toEqual({ host: "h", port: 3306, user: "root", password: "s3cret", database: "banco_a" });
  });

  it("o mesmo perfil abre conexões para bancos diferentes em chamadas distintas (RF-11)", async () => {
    const profile = await createProfile({ userId: "u1", label: "prod", host: "h", port: 3306, user: "root", password: "s3cret" });
    const a = await resolveForConnection(profile.id, "banco_a");
    const b = await resolveForConnection(profile.id, "banco_b");
    expect(a.database).toBe("banco_a");
    expect(b.database).toBe("banco_b");
  });

  it("sem banco explícito não quebra — database fica indefinido", async () => {
    const profile = await createProfile({ userId: "u1", label: "prod", host: "h", port: 3306, user: "root", password: "s3cret" });
    const params = await resolveForConnection(profile.id);
    expect(params.database).toBeUndefined();
    expect(params.password).toBe("s3cret");
  });

  it("perfil criado não guarda banco nem senha em claro", async () => {
    const profile = await createProfile({ userId: "u1", label: "prod", host: "h", port: 3306, user: "root", password: "s3cret" });
    const row = rows.get(profile.id)!;
    expect(row).not.toHaveProperty("database_name");
    expect(row.user_id).toBe("u1");
    expect((row.password_enc as Buffer).toString("latin1")).not.toContain("s3cret");
  });

  it("perfil inexistente lança erro", async () => {
    await expect(resolveForConnection("nao-existe", "x")).rejects.toThrow(/não encontrado/);
  });
});
