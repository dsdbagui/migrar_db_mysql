import type { FastifyInstance } from "fastify";
import { createProfile, listProfiles, getProfile, deleteProfile } from "./credentialVault.js";

/**
 * CRUD mínimo de connection_profiles — necessário para exercitar as rotas de
 * tables/routines deste incremento (elas exigem sourceProfileId/targetProfileId).
 * A feature `config` completa (wizard multi-step, BR-HUMANA-001) fica para o
 * próximo incremento — isto é só a base de dados de perfis (App DB).
 */

interface CreateProfileBody {
  label: string;
  host: string;
  port?: number;
  user: string;
  password: string;
  databaseName?: string;
}

export function registerProfileRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateProfileBody }>("/connection-profiles", async (request, reply) => {
    const body = request.body;
    const profile = await createProfile({
      label: body.label,
      host: body.host,
      port: body.port ?? 3306,
      user: body.user,
      password: body.password,
      databaseName: body.databaseName,
    });
    return reply.code(201).send(profile);
  });

  app.get("/connection-profiles", async (_request, reply) => {
    return reply.send(await listProfiles());
  });

  app.get<{ Params: { id: string } }>("/connection-profiles/:id", async (request, reply) => {
    const profile = await getProfile(request.params.id);
    if (!profile) return reply.code(404).send({ error: "perfil não encontrado" });
    return reply.send(profile);
  });

  app.delete<{ Params: { id: string } }>("/connection-profiles/:id", async (request, reply) => {
    await deleteProfile(request.params.id);
    return reply.code(204).send();
  });
}
