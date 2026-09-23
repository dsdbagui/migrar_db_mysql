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

  app.get("/health", async () => ({ status: "ok" }));

  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerRoutinesRoutes(app);
  registerTablesRoutes(app);
  registerReportsRoutes(app);
  registerJobRoutes(app);

  return app;
}
