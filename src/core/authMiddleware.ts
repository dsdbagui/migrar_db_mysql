import type { FastifyInstance } from "fastify";
import { getSession } from "./sessionStore.js";

/**
 * Middleware global de autenticação (_reversa_forward/005-perfil-conexao-por-usuario, D-08, RF-05).
 *
 * Um único hook onRequest para toda a API, com allowlist explícita das rotas públicas, em vez de
 * proteger rota por rota — uma rota nova nasce protegida por padrão. Sessão ausente, inexistente
 * ou expirada recebem a mesma resposta 401, antes de qualquer handler de rota rodar.
 */

export const SESSION_COOKIE = "session";

const PUBLIC_PATHS = new Set(["/login", "/health"]);

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchidos pelo middleware em toda rota protegida — vazios só nas rotas públicas. */
    userId: string;
    username: string;
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("userId", "");
  app.decorateRequest("username", "");

  app.addHook("onRequest", async (request, reply) => {
    // Preflight CORS não carrega cookie — quem responde é o @fastify/cors.
    if (request.method === "OPTIONS") return;
    const path = request.url.split("?")[0]!;
    if (PUBLIC_PATHS.has(path)) return;

    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await getSession(token) : null;
    if (!session) {
      return reply.code(401).send({ error: "não autenticado" });
    }
    request.userId = session.userId;
    request.username = session.username;
  });
}

// Mesmo efeito do fastify-plugin, sem depender dele diretamente: o hook e os decorators valem
// para a instância raiz (todas as rotas), e o plugin roda depois de @fastify/cors e
// @fastify/cookie — registrados antes em app.ts —, então o 401 já sai com cabeçalhos CORS e
// request.cookies já está preenchido quando este hook executa.
(authPlugin as unknown as Record<symbol, boolean>)[Symbol.for("skip-override")] = true;

export function registerAuthMiddleware(app: FastifyInstance): void {
  app.register(authPlugin);
}
