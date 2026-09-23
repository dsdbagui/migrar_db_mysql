import type { FastifyInstance } from "fastify";
import { createProfile, listProfiles, getProfile, deleteProfile } from "./credentialVault.js";

/**
 * CRUD mínimo de connection_profiles — necessário para exercitar as rotas de
 * tables/routines deste incremento (elas exigem sourceProfileId/targetProfileId).
 * A feature `config` completa (wizard multi-step, BR-HUMANA-001) fica para o
 * próximo incremento — isto é só a base de dados de perfis (App DB).
 *
 * _reversa_forward/005-perfil-conexao-por-usuario: todas as rotas operam só sobre os perfis do
 * usuário da sessão (request.userId, preenchido pelo authMiddleware) — o dono nunca vem do corpo.
 * Perfil de outro dono responde 404, não 403, para não revelar que o id existe.
 */

interface CreateProfileBody {
  label: string;
  host: string;
  port?: number;
  user: string;
  password: string;
}

export function registerProfileRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateProfileBody }>("/connection-profiles", async (request, reply) => {
    const body = request.body;
    try {
      const profile = await createProfile({
        userId: request.userId,
        label: body.label,
        host: body.host.trim(),
        port: body.port ?? 3306,
        user: body.user,
        password: body.password,
      });
      return reply.code(201).send(profile);
    } catch (err) {
      // uq_connection_profiles_user_label (005_*.sql): rótulo único por dono.
      if ((err as { code?: string })?.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "você já tem um perfil com esse rótulo" });
      }
      throw err;
    }
  });

  app.get("/connection-profiles", async (request, reply) => {
    return reply.send(await listProfiles(request.userId));
  });

  app.get<{ Params: { id: string } }>("/connection-profiles/:id", async (request, reply) => {
    const profile = await getProfile(request.params.id, request.userId);
    if (!profile) return reply.code(404).send({ error: "perfil não encontrado" });
    return reply.send(profile);
  });

  app.delete<{ Params: { id: string } }>("/connection-profiles/:id", async (request, reply) => {
    try {
      const deleted = await deleteProfile(request.params.id, request.userId);
      if (!deleted) return reply.code(404).send({ error: "perfil não encontrado" });
    } catch (err) {
      if ((err as { code?: string })?.code === "ER_ROW_IS_REFERENCED_2") {
        return reply.code(409).send({ error: "perfil em uso por uma migração já registrada" });
      }
      throw err;
    }
    return reply.code(204).send();
  });
}
