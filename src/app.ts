import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { registerAuthMiddleware } from "./core/authMiddleware.js";
import { registerAuthRoutes } from "./core/authRoutes.js";
import { registerProfileRoutes } from "./core/profileRoutes.js";
import { registerRoutinesRoutes } from "./features/routines/routes.js";
import { registerTablesRoutes } from "./features/tables/routes.js";
import { registerReportsRoutes } from "./features/reports/routes.js";
import { registerJobRoutes } from "./features/jobs/routes.js";
import { logger } from "./core/logger.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    // Cookie de sessão precisa cruzar origens em dev (Vite 5173 → Fastify 3000) —
    // _reversa_forward/005-perfil-conexao-por-usuario, Risco 1 do roadmap.md.
    credentials: true,
  });
  app.register(cookie);
  // Depois de cors e cookie: o middleware precisa de request.cookies, e o 401 dele precisa
  // sair com os cabeçalhos CORS para o frontend conseguir ler o status (D-08).
  registerAuthMiddleware(app);

  // Com logger: false, o Fastify responde 500 sem registrar nada — a exceção sumia do journalctl.
  // Loga só message/code/stack: nunca o corpo da requisição nem err.sql do mysql2, que podem
  // carregar senha ou token de sessão. Erros 4xx (ex. JSON inválido) seguem o tratamento padrão.
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, request, reply) => {
    const status = err.statusCode ?? 500;
    if (status < 500) return reply.send(err);
    logger.error("Erro não tratado na requisição", {
      method: request.method,
      url: request.url.split("?")[0],
      error: err.message,
      code: err.code,
      stack: err.stack,
    });
    return reply.code(500).send({ error: "erro interno" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerRoutinesRoutes(app);
  registerTablesRoutes(app);
  registerReportsRoutes(app);
  registerJobRoutes(app);

  return app;
}
