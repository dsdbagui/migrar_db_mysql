import { randomUUID } from "node:crypto";
import { getAppDb } from "./db/appDb.js";
import { hashPassword } from "./passwordHash.js";
import { validateNewPassword } from "./passwordPolicy.js";

/**
 * Usuários da aplicação web (app_users) — _reversa_forward/005-perfil-conexao-por-usuario.
 * Compartilhado por POST /users (authRoutes.ts) e pelo script de bootstrap do primeiro usuário
 * (db/createUser.ts, D-09), para que os dois caminhos gravem exatamente o mesmo formato de hash.
 *
 * _reversa_forward/006-redefinicao-de-senha: toda gravação de senha (criação e troca) passa pela
 * política de passwordPolicy.ts, e a troca de senha encerra as sessões do usuário (RN-03).
 */

export interface AppUserWithHash {
  id: string;
  username: string;
  passwordHash: Buffer;
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username já cadastrado: ${username}`);
  }
}

/** Senha nova fora da política mínima — a mensagem é a mesma em todos os canais (RF-10). */
export class PasswordPolicyError extends Error {}

function assertPolicy(password: string): void {
  const policyError = validateNewPassword(password);
  if (policyError) throw new PasswordPolicyError(policyError);
}

interface AppUserRow {
  id: string;
  username: string;
  password_hash: Buffer;
}

function rowToUser(row: AppUserRow | undefined): AppUserWithHash | null {
  return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
}

export async function findUserByUsername(username: string): Promise<AppUserWithHash | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT id, username, password_hash FROM app_users WHERE username = ?", [
    username,
  ]);
  return rowToUser((rows as AppUserRow[])[0]);
}

export async function findUserById(id: string): Promise<AppUserWithHash | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT id, username, password_hash FROM app_users WHERE id = ?", [id]);
  return rowToUser((rows as AppUserRow[])[0]);
}

export async function createAppUser(username: string, password: string): Promise<{ id: string; username: string }> {
  assertPolicy(password);
  const db = getAppDb();
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await db.query("INSERT INTO app_users (id, username, password_hash) VALUES (?, ?, ?)", [id, username, passwordHash]);
  } catch (err) {
    if ((err as { code?: string })?.code === "ER_DUP_ENTRY") throw new UsernameTakenError(username);
    throw err;
  }
  return { id, username };
}

/**
 * Troca a senha e encerra TODAS as sessões do usuário na mesma transação (D-04): não pode existir
 * um instante com a senha nova valendo e sessões abertas com a antiga (RN-03). Usado pela CLI
 * (create-user --reset) e por POST /users/me/password.
 */
export async function changePassword(userId: string, newPassword: string): Promise<{ sessionsEnded: number }> {
  assertPolicy(newPassword);
  // Hash fora da transação: o scrypt leva ~0,5s e não precisa segurar conexão/locks.
  const passwordHash = await hashPassword(newPassword);
  const conn = await getAppDb().getConnection();
  try {
    await conn.beginTransaction();
    const [updated] = await conn.query<any>("UPDATE app_users SET password_hash = ? WHERE id = ?", [
      passwordHash,
      userId,
    ]);
    if ((updated as { affectedRows: number }).affectedRows === 0) {
      throw new Error(`usuário ${userId} não encontrado`);
    }
    const [deleted] = await conn.query<any>("DELETE FROM app_sessions WHERE user_id = ?", [userId]);
    await conn.commit();
    return { sessionsEnded: (deleted as { affectedRows: number }).affectedRows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
