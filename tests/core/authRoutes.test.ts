import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/interfaces/autenticacao.md
 * (POST /login, POST /logout, POST /users), requirements.md (RF-03, RF-04, RF-13).
 * Usuários e sessões simulados em memória no limite dos módulos (appUsers, sessionStore) —
 * a persistência real é coberta por tests/core/sessionStore.test.ts. passwordHash é
 * substituído por uma versão trivial: o custo do scrypt não é o que este teste verifica
 * (coberto por tests/core/passwordHash.test.ts).
 *
 * spec-id: _reversa_forward/006-redefinicao-de-senha/interfaces/troca-de-senha.md,
 * interfaces/criacao-de-usuario.md (RN-04, RN-05, RF-07..RF-10). A política de senha é a real
 * (passwordPolicy.ts); só a persistência é simulada.
 */

const users = new Map<string, { id: string; username: string; passwordHash: Buffer }>();
const sessions = new Map<string, { userId: string; username: string }>();
let sessionSeq = 0;

vi.mock("../../src/core/passwordHash.js", () => ({
  hashPassword: async (pw: string) => Buffer.from(`hash:${pw}`),
  verifyPassword: async (pw: string, hash: Buffer) => hash.toString() === `hash:${pw}`,
  getDummyHash: async () => Buffer.from("hash:__dummy__"),
}));

vi.mock("../../src/core/appUsers.js", async () => {
  const { validateNewPassword } = await import("../../src/core/passwordPolicy.js");
  class UsernameTakenError extends Error {}
  class PasswordPolicyError extends Error {}
  return {
    UsernameTakenError,
    PasswordPolicyError,
    findUserByUsername: async (username: string) => users.get(username) ?? null,
    findUserById: async (id: string) => [...users.values()].find((u) => u.id === id) ?? null,
    changePassword: async (userId: string, newPassword: string) => {
      const policyError = validateNewPassword(newPassword);
      if (policyError) throw new PasswordPolicyError(policyError);
      const user = [...users.values()].find((u) => u.id === userId)!;
      user.passwordHash = Buffer.from(`hash:${newPassword}`);
      let sessionsEnded = 0;
      for (const [id, s] of sessions) {
        if (s.userId === userId) {
          sessions.delete(id);
          sessionsEnded++;
        }
      }
      return { sessionsEnded };
    },
    createAppUser: async (username: string, password: string) => {
      const policyError = validateNewPassword(password);
      if (policyError) throw new PasswordPolicyError(policyError);
      if (users.has(username)) throw new UsernameTakenError(username);
      const user = { id: `id-${username}`, username, passwordHash: Buffer.from(`hash:${password}`) };
      users.set(username, user);
      return { id: user.id, username };
    },
  };
});

vi.mock("../../src/core/sessionStore.js", () => ({
  SESSION_TTL_SECONDS: 7200,
  createSession: async (userId: string) => {
    const id = `tok-${++sessionSeq}`;
    const user = [...users.values()].find((u) => u.id === userId)!;
    sessions.set(id, { userId, username: user.username });
    return { id };
  },
  getSession: async (id: string) => sessions.get(id) ?? null,
  deleteSession: async (id: string) => {
    sessions.delete(id);
  },
}));

const { buildApp } = await import("../../src/app.js");

function sessionCookieFrom(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  return res.cookies.find((c) => c.name === "session")?.value;
}

beforeEach(() => {
  users.clear();
  sessions.clear();
  users.set("operador", { id: "id-operador", username: "operador", passwordHash: Buffer.from("hash:senha-certa") });
});

describe("POST /login", () => {
  it("credenciais corretas: 200 e cookie de sessão httpOnly/SameSite=Lax/2h", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "operador", password: "senha-certa" },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === "session")!;
    expect(cookie).toBeDefined();
    expect(sessions.has(cookie.value)).toBe(true);
    expect(cookie.httpOnly).toBe(true);
    expect(String(cookie.sameSite).toLowerCase()).toBe("lax");
    expect(cookie.maxAge).toBe(7200);
    expect(cookie.path).toBe("/");
  });

  it("senha errada e usuário inexistente recebem a mesma resposta genérica (RF-03)", async () => {
    const app = buildApp();
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "operador", password: "errada" },
    });
    const unknownUser = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "fantasma", password: "qualquer" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    expect(wrongPassword.json()).toEqual({ error: "credenciais inválidas" });
    expect(sessionCookieFrom(wrongPassword)).toBeUndefined();
    expect(sessions.size).toBe(0);
  });

  it("corpo sem campos obrigatórios: 400", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/login", payload: { username: "operador" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /logout", () => {
  it("encerra a sessão: 204, cookie limpo, e a sessão antiga passa a receber 401", async () => {
    const app = buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "operador", password: "senha-certa" },
    });
    const token = sessionCookieFrom(login)!;

    const logout = await app.inject({ method: "POST", url: "/logout", cookies: { session: token } });
    expect(logout.statusCode).toBe(204);
    const cleared = logout.cookies.find((c) => c.name === "session")!;
    expect(cleared.value).toBe("");
    expect(sessions.has(token)).toBe(false);

    const after = await app.inject({ method: "POST", url: "/logout", cookies: { session: token } });
    expect(after.statusCode).toBe(401);
  });
});

describe("POST /users", () => {
  it("sem sessão: 401 (cadastro fechado, RF-13)", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/users", payload: { username: "novo", password: "x" } });
    expect(res.statusCode).toBe(401);
    expect(users.has("novo")).toBe(false);
  });

  it("com sessão: 201 com id e username, nunca o hash", async () => {
    sessions.set("tok-admin", { userId: "id-operador", username: "operador" });
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users",
      cookies: { session: "tok-admin" },
      payload: { username: "novo", password: "senha-nova" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: "id-novo", username: "novo" });
    expect(res.body).not.toContain("hash");
  });

  it("username duplicado: 409", async () => {
    sessions.set("tok-admin", { userId: "id-operador", username: "operador" });
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users",
      cookies: { session: "tok-admin" },
      payload: { username: "operador", password: "outra-senha" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "username já cadastrado" });
  });

  it("senha vazia: 400", async () => {
    sessions.set("tok-admin", { userId: "id-operador", username: "operador" });
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users",
      cookies: { session: "tok-admin" },
      payload: { username: "novo", password: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("política de senha em POST /users e POST /login (006)", () => {
  it("POST /users com senha de 7 caracteres: 400 com a mensagem da política, nada gravado", async () => {
    sessions.set("tok-admin", { userId: "id-operador", username: "operador" });
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users",
      cookies: { session: "tok-admin" },
      payload: { username: "novo", password: "1234567" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/8 caracteres/);
    expect(users.has("novo")).toBe(false);
  });

  it("POST /login não aplica a política: senha curta já existente continua entrando", async () => {
    users.set("antigo", { id: "id-antigo", username: "antigo", passwordHash: Buffer.from("hash:abc") });
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/login", payload: { username: "antigo", password: "abc" } });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /users/me/password (006)", () => {
  beforeEach(() => {
    sessions.set("tok-a", { userId: "id-operador", username: "operador" });
    sessions.set("tok-b", { userId: "id-operador", username: "operador" });
    users.set("outro", { id: "id-outro", username: "outro", passwordHash: Buffer.from("hash:do-outro") });
    sessions.set("tok-outro", { userId: "id-outro", username: "outro" });
  });

  it("troca a própria senha: 204, cookie limpo, todas as sessões do usuário encerradas", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      cookies: { session: "tok-a" },
      payload: { currentPassword: "senha-certa", newPassword: "nova-senha-1" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === "session")!.value).toBe("");
    expect(users.get("operador")!.passwordHash.toString()).toBe("hash:nova-senha-1");
    expect(sessions.has("tok-a")).toBe(false);
    expect(sessions.has("tok-b")).toBe(false);
    expect(sessions.has("tok-outro")).toBe(true);

    const after = await app.inject({ method: "GET", url: "/connection-profiles", cookies: { session: "tok-b" } });
    expect(after.statusCode).toBe(401);
  });

  it("senha atual errada: 403 (não 401), nada muda e a sessão continua válida", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      cookies: { session: "tok-a" },
      payload: { currentPassword: "errada", newPassword: "nova-senha-1" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "senha atual incorreta" });
    expect(users.get("operador")!.passwordHash.toString()).toBe("hash:senha-certa");
    expect(sessions.has("tok-a")).toBe(true);
  });

  it("senha nova curta: 400, nada muda", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      cookies: { session: "tok-a" },
      payload: { currentPassword: "senha-certa", newPassword: "1234567" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/8 caracteres/);
    expect(sessions.has("tok-a")).toBe(true);
  });

  it("corpo inválido: 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      cookies: { session: "tok-a" },
      payload: { newPassword: "nova-senha-1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("ignora qualquer indicação de outro usuário no corpo — só troca a do usuário da sessão", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      cookies: { session: "tok-a" },
      payload: { currentPassword: "senha-certa", newPassword: "nova-senha-1", userId: "id-outro", username: "outro" },
    });
    expect(res.statusCode).toBe(204);
    expect(users.get("outro")!.passwordHash.toString()).toBe("hash:do-outro");
  });

  it("sem sessão: 401", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/users/me/password",
      payload: { currentPassword: "senha-certa", newPassword: "nova-senha-1" },
    });
    expect(res.statusCode).toBe(401);
  });
});
