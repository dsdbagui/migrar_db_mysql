import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/006-redefinicao-de-senha/roadmap.md (D-04, D-05, D-07),
 * data-delta.md § 4, requirements.md (RN-03, RN-05, RF-08).
 * App DB simulada em memória, com uma conexão transacional que só aplica as escritas no commit
 * — um rollback descarta tudo, como o InnoDB faria. passwordHash é trivial: o custo do scrypt
 * não é o que este teste verifica.
 */

interface User {
  id: string;
  username: string;
  password_hash: Buffer;
}

const users = new Map<string, User>();
const sessions = new Map<string, { id: string; user_id: string }>();
let failSessionDelete = false;
const txLog: string[] = [];

vi.mock("../../src/core/passwordHash.js", () => ({
  hashPassword: async (pw: string) => Buffer.from(`hash:${pw}`),
}));

function makeConnection() {
  let pending: Array<() => void> = [];
  return {
    beginTransaction: vi.fn(async () => {
      txLog.push("begin");
    }),
    query: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes("UPDATE app_users SET password_hash")) {
        const [hash, id] = params;
        const user = users.get(id);
        if (user) pending.push(() => (user.password_hash = hash));
        return [{ affectedRows: user ? 1 : 0 }];
      }
      if (sql.includes("DELETE FROM app_sessions WHERE user_id")) {
        if (failSessionDelete) throw new Error("falha simulada no DELETE");
        const ids = [...sessions.values()].filter((s) => s.user_id === params[0]).map((s) => s.id);
        pending.push(() => ids.forEach((id) => sessions.delete(id)));
        return [{ affectedRows: ids.length }];
      }
      throw new Error(`SQL não mockado na conexão: ${sql}`);
    }),
    commit: vi.fn(async () => {
      txLog.push("commit");
      pending.forEach((apply) => apply());
      pending = [];
    }),
    rollback: vi.fn(async () => {
      txLog.push("rollback");
      pending = [];
    }),
    release: vi.fn(() => {
      txLog.push("release");
    }),
  };
}

const poolQuery = vi.fn(async (sql: string, params: any[] = []) => {
  if (sql.includes("FROM app_users WHERE id = ?")) {
    const u = users.get(params[0]);
    return [u ? [u] : []];
  }
  if (sql.includes("INSERT INTO app_users")) {
    users.set(params[0], { id: params[0], username: params[1], password_hash: params[2] });
    return [{ affectedRows: 1 }];
  }
  throw new Error(`SQL não mockado no pool: ${sql}`);
});

vi.mock("../../src/core/db/appDb.js", () => ({
  getAppDb: () => ({ query: poolQuery, getConnection: async () => makeConnection() }),
}));

const { changePassword, findUserById, createAppUser, PasswordPolicyError } = await import(
  "../../src/core/appUsers.js"
);

beforeEach(() => {
  users.clear();
  sessions.clear();
  txLog.length = 0;
  failSessionDelete = false;
  poolQuery.mockClear();
  users.set("u1", { id: "u1", username: "ana", password_hash: Buffer.from("hash:antiga-123") });
  users.set("u2", { id: "u2", username: "bruno", password_hash: Buffer.from("hash:do-bruno") });
  sessions.set("s1", { id: "s1", user_id: "u1" });
  sessions.set("s2", { id: "s2", user_id: "u1" });
  sessions.set("s3", { id: "s3", user_id: "u2" });
});

describe("findUserById", () => {
  it("devolve o usuário com o hash, ou null", async () => {
    expect(await findUserById("u1")).toEqual({ id: "u1", username: "ana", passwordHash: Buffer.from("hash:antiga-123") });
    expect(await findUserById("nao-existe")).toBeNull();
  });
});

describe("changePassword", () => {
  it("troca o hash e encerra só as sessões daquele usuário, numa transação", async () => {
    const result = await changePassword("u1", "nova-senha-1");
    expect(result).toEqual({ sessionsEnded: 2 });
    expect(users.get("u1")!.password_hash.toString()).toBe("hash:nova-senha-1");
    expect([...sessions.keys()]).toEqual(["s3"]);
    expect(txLog).toEqual(["begin", "commit", "release"]);
  });

  it("faz rollback se encerrar as sessões falhar — o hash antigo continua valendo", async () => {
    failSessionDelete = true;
    await expect(changePassword("u1", "nova-senha-1")).rejects.toThrow(/falha simulada/);
    expect(users.get("u1")!.password_hash.toString()).toBe("hash:antiga-123");
    expect(sessions.size).toBe(3);
    expect(txLog).toEqual(["begin", "rollback", "release"]);
  });

  it("usuário inexistente: erro e rollback, nada muda", async () => {
    await expect(changePassword("nao-existe", "nova-senha-1")).rejects.toThrow(/não encontrado/);
    expect(txLog).toEqual(["begin", "rollback", "release"]);
  });

  it("senha fora da política: PasswordPolicyError sem abrir transação", async () => {
    await expect(changePassword("u1", "curta")).rejects.toBeInstanceOf(PasswordPolicyError);
    expect(txLog).toEqual([]);
    expect(users.get("u1")!.password_hash.toString()).toBe("hash:antiga-123");
  });
});

describe("createAppUser aplica a mesma política", () => {
  it("recusa senha curta sem gravar", async () => {
    await expect(createAppUser("carla", "1234567")).rejects.toBeInstanceOf(PasswordPolicyError);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("aceita senha de 8 caracteres", async () => {
    const user = await createAppUser("carla", "12345678");
    expect(user.username).toBe("carla");
  });
});
