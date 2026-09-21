import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
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
  });

  app.get("/health", async () => ({ status: "ok" }));

  registerProfileRoutes(app);
  registerRoutinesRoutes(app);
  registerTablesRoutes(app);
  registerReportsRoutes(app);
  registerJobRoutes(app);

  return app;
}
