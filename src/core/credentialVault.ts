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
 */

export interface ConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  databaseName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectionProfileRow {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password_enc: Buffer;
  database_name: string | null;
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
    databaseName: row.database_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProfile(input: {
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  databaseName?: string;
}): Promise<ConnectionProfile> {
  const db = getAppDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO connection_profiles (id, label, host, port, user, password_enc, database_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.label,
      input.host,
      input.port,
      input.user,
      encryptPassword(input.password),
      input.databaseName ?? null,
    ],
  );
  const profile = await getProfile(id);
  if (!profile) throw new Error("Falha ao criar perfil de conexão");
  return profile;
}

export async function listProfiles(): Promise<ConnectionProfile[]> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles ORDER BY label");
  return (rows as ConnectionProfileRow[]).map(rowToProfile);
}

export async function getProfile(id: string): Promise<ConnectionProfile | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles WHERE id = ?", [id]);
  const row = (rows as ConnectionProfileRow[])[0];
  return row ? rowToProfile(row) : null;
}

export async function deleteProfile(id: string): Promise<void> {
  const db = getAppDb();
  await db.query("DELETE FROM connection_profiles WHERE id = ?", [id]);
}

/**
 * Único ponto que decifra a senha — usado pelo core/connectionManager.ts para de fato
 * abrir a conexão MySQL. Nunca expor o retorno desta função via API HTTP.
 */
export async function resolveForConnection(id: string): Promise<ConnectionParams> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM connection_profiles WHERE id = ?", [id]);
  const row = (rows as ConnectionProfileRow[])[0];
  if (!row) throw new Error(`Perfil de conexão ${id} não encontrado`);
  return {
    host: row.host,
    port: row.port,
    user: row.user,
    password: decryptPassword(row.password_enc),
    database: row.database_name ?? undefined,
  };
}
