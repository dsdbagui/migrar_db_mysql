import Fastify, { type FastifyInstance } from "fastify";
import { registerProfileRoutes } from "./core/profileRoutes.js";
import { registerRoutinesRoutes } from "./features/routines/routes.js";
import { registerTablesRoutes } from "./features/tables/routes.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  registerProfileRoutes(app);
  registerRoutinesRoutes(app);
  registerTablesRoutes(app);

  return app;
}
