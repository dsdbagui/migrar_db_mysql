import type { FastifyInstance } from "fastify";
import {
  findUserByUsername,
  findUserById,
  createAppUser,
  changePassword,
  UsernameTakenError,
  PasswordPolicyError,
} from "./appUsers.js";
import { validateNewPassword } from "./passwordPolicy.js";
import { verifyPassword, getDummyHash } from "./passwordHash.js";
import { createSession, deleteSession, SESSION_TTL_SECONDS } from "./sessionStore.js";
import { SESSION_COOKIE } from "./authMiddleware.js";
import { logger } from "./logger.js";

/**
 * Login, logout e cadastro fechado de usuários da aplicação —
 * contrato em _reversa_forward/005-perfil-conexao-por-usuario/interfaces/autenticacao.md.
 * /login é a única rota pública daqui (allowlist do authMiddleware.ts), /logout e /users exigem
 * sessão. Nenhum log jamais inclui a senha (mesmo cuidado de credentialVault.ts).
 *
 * _reversa_forward/006-redefinicao-de-senha: POST /users/me/password (troca da própria senha) e
 * política mínima de senha em toda gravação (nunca no login — senhas antigas curtas continuam
 * entrando até a próxima troca).
 */

interface CredentialsBody {
  username?: unknown;
  password?: unknown;
}

function readCredentials(body: unknown): { username: string; password: string } | null {
  const { username, password } = (body ?? {}) as CredentialsBody;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (!username.trim() || !password) return null;
  return { username: username.trim(), password };
}

// Secure por padrão (a VM hermes serve via HTTPS atrás do nginx, e navegadores aceitam cookie
// Secure em http://localhost). SESSION_COOKIE_SECURE=false só para acessar um ambiente de teste
// por HTTP puro fora de localhost, onde o navegador descartaria um cookie Secure.
function cookieSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE !== "false";
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/login", async (request, reply) => {
    const credentials = readCredentials(request.body);
    if (!credentials) return reply.code(400).send({ error: "username e password são obrigatórios" });

    const user = await findUserByUsername(credentials.username);
    // Usuário inexistente ainda paga o custo do scrypt contra um hash qualquer: mesma mensagem e
    // mesmo tempo de resposta que "senha errada", sem permitir enumerar contas (RF-03).
    const valid = await verifyPassword(credentials.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) {
      logger.warn("Tentativa de login recusada", { username: credentials.username });
      return reply.code(401).send({ error: "credenciais inválidas" });
    }

    const session = await createSession(user.id);
    logger.ok("Login realizado", { username: user.username });
    return reply
      .setCookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: cookieSecure(),
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      })
      .send({});
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(token);
    logger.info("Logout realizado", { username: request.username });
    return reply
      .clearCookie(SESSION_COOKIE, { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/" })
      .code(204)
      .send();
  });

  app.post("/users", async (request, reply) => {
    const credentials = readCredentials(request.body);
    if (!credentials) return reply.code(400).send({ error: "username e password são obrigatórios" });

    try {
      const user = await createAppUser(credentials.username, credentials.password);
      logger.ok("Usuário da aplicação criado", { username: user.username, createdBy: request.username });
      return reply.code(201).send(user);
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        return reply.code(409).send({ error: "username já cadastrado" });
      }
      if (err instanceof PasswordPolicyError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // Só a própria senha (RN-04): o usuário vem da sessão, nunca do corpo ou da URL — "me" torna
  // estruturalmente impossível apontar outro usuário. Redefinir a de terceiros é só pela CLI na VM.
  app.post("/users/me/password", async (request, reply) => {
    const { currentPassword, newPassword } = (request.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string") {
      return reply.code(400).send({ error: "currentPassword e newPassword são obrigatórios" });
    }
    // Política antes da senha atual: não gasta o scrypt quando a nova já seria recusada.
    const policyError = validateNewPassword(newPassword);
    if (policyError) return reply.code(400).send({ error: policyError });

    const user = await findUserById(request.userId);
    const valid = user ? await verifyPassword(currentPassword, user.passwordHash) : false;
    if (!user || !valid) {
      logger.warn("Troca de senha recusada: senha atual incorreta", { username: request.username });
      // 403, não 401: o frontend trata todo 401 como sessão expirada e mandaria ao login (D-06).
      return reply.code(403).send({ error: "senha atual incorreta" });
    }

    // Troca o hash e apaga todas as sessões do usuário — inclusive esta — na mesma transação (RN-03).
    const { sessionsEnded } = await changePassword(user.id, newPassword);
    logger.ok("Senha redefinida", { username: user.username, canal: "api", sessoesEncerradas: sessionsEnded });
    return reply
      .clearCookie(SESSION_COOKIE, { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/" })
      .code(204)
      .send();
  });
}
