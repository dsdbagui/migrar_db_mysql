import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { getAppDb } from "./db/appDb.js";
import type { ConnectionParams } from "./connectionManager.js";

/**
 * Cofre de credenciais (BR-HUMANA-002 em target_business_rules.md — decisão do operador,
 * resolvida em revisão: perfis salvos e reutilizáveis, senha cifrada em repouso, em vez
 * de digitar a cada execução como no CLI legado).
 *
 * Nunca retorna a senha em texto claro por nenhum método de consulta (BR-MIGRAR-015) —
 * só `resolveForConnection`, usado internamente pelo Connection Manager, decifra.
 *
 * _reversa_forward/005-perfil-conexao-por-usuario: cada perfil tem um dono (user_id) e é
 * estritamente privado (RN-02) — toda consulta exposta à API filtra pelo dono. O perfil não
 * guarda mais banco (RN-03): o banco vem de cada job, por parâmetro de resolveForConnection (D-04).
 */

export interface ConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectionProfileRow {
  id: string;
  user_id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password_enc: Buffer;
  created_at: Date;
  updated_at: Date;
}

function getKey(): Buffer {
  const hex = process.env.CREDENTIAL_VAULT_KEY;
  if (!hex) {
    throw new Error(
      "CREDENTIAL_VAULT_KEY não configurada — gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_VAULT_KEY deve ser uma chave de 32 bytes em hex (AES-256)");
  }
  return key;
}

function encryptPassword(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // formato: iv (12) || authTag (16) || ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptPassword(blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function rowToProfile(row: ConnectionProfileRow): ConnectionProfile {
  return {
    id: row.id,
    label: row.label,
    host: row.host,
    port: row.port,
    user: row.user,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProfile(input: {
  userId: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
}): Promise<ConnectionProfile> {
  const db = getAppDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO connection_profiles (id, user_id, label, host, port, user, password_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.label, input.host, input.port, input.user, encryptPassword(input.password)],
  );
  const profile = await getProfile(id, input.userId);
  if (!profile) throw new Error("Falha ao criar perfil de conexão");
  return profile;
}

export async function listProfiles(userId: string): Promise<ConnectionProfile[]> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles WHERE user_id = ? ORDER BY label", [
    userId,
  ]);
  return (rows as ConnectionProfileRow[]).map(rowToProfile);
}

/** Perfil de outro dono é indistinguível de perfil inexistente: ambos retornam null. */
export async function getProfile(id: string, userId: string): Promise<ConnectionProfile | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles WHERE id = ? AND user_id = ?", [
    id,
    userId,
  ]);
  const row = (rows as ConnectionProfileRow[])[0];
  return row ? rowToProfile(row) : null;
}

/** Retorna false quando o perfil não existe ou pertence a outro dono (nada é apagado). */
export async function deleteProfile(id: string, userId: string): Promise<boolean> {
  const db = getAppDb();
  const [result] = await db.query<any>("DELETE FROM connection_profiles WHERE id = ? AND user_id = ?", [id, userId]);
  return (result as { affectedRows: number }).affectedRows > 0;
}

/**
 * Único ponto que decifra a senha — usado pelo core/connectionManager.ts para de fato
 * abrir a conexão MySQL. Nunca expor o retorno desta função via API HTTP.
 *
 * Não filtra por dono: roda também dentro de runJob, em background, sem sessão. A posse do
 * perfil é verificada pelas rotas (getProfile com o userId da sessão) antes de o job existir.
 * `database` vem do job/preview (D-04) — o mesmo perfil serve a bancos diferentes.
 */
export async function resolveForConnection(id: string, database?: string): Promise<ConnectionParams> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles WHERE id = ?", [id]);
  const row = (rows as ConnectionProfileRow[])[0];
  if (!row) throw new Error(`Perfil de conexão ${id} não encontrado`);
  return {
    host: row.host,
    port: row.port,
    user: row.user,
    password: decryptPassword(row.password_enc),
    database,
  };
}
