import { randomBytes } from "node:crypto";
import { getAppDb } from "./db/appDb.js";

/**
 * Sessões de aplicação persistidas em app_sessions (App DB) —
 * _reversa_forward/005-perfil-conexao-por-usuario, D-01. Token opaco (32 bytes aleatórios em hex)
 * no cookie httpOnly "session"; expiração fixa de 2h a partir do login, sem renovação por uso.
 * O relógio usado é sempre o do App DB (NOW()), tanto na criação quanto na validação.
 */

export const SESSION_TTL_SECONDS = 2 * 60 * 60;

export interface SessionIdentity {
  userId: string;
  username: string;
}

export async function createSession(userId: string): Promise<{ id: string }> {
  const db = getAppDb();
  const id = randomBytes(32).toString("hex");
  await db.query(
    `INSERT INTO app_sessions (id, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL 2 HOUR)`,
    [id, userId],
  );
  return { id };
}

/** Sessão inexistente e sessão expirada são indistinguíveis para o chamador: ambas retornam null. */
export async function getSession(id: string): Promise<SessionIdentity | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    `SELECT s.user_id, u.username
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > NOW()`,
    [id],
  );
  const row = (rows as { user_id: string; username: string }[])[0];
  return row ? { userId: row.user_id, username: row.username } : null;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getAppDb();
  await db.query("DELETE FROM app_sessions WHERE id = ?", [id]);
}
