import mysql from "mysql2/promise";
import { logger } from "./logger.js";

/**
 * Porte de connect/ask_connection/ensure_connected (migrate_routines.py:248-344).
 * A parte interativa (prompt de terminal) fica de fora — aqui os parâmetros já chegam
 * resolvidos a partir de um ConnectionProfile (ver core/credentialVault.ts), coletados
 * pelo wizard web antes do job iniciar (BR-DESCARTAR-001/002 em discard_log.md).
 */

export interface ConnectionParams {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}

export type MigrationConnection = mysql.Connection;

export async function connect(label: string, params: ConnectionParams): Promise<MigrationConnection> {
  try {
    const conn = await mysql.createConnection({
      host: params.host,
      port: params.port,
      user: params.user,
      password: params.password,
      database: params.database,
      multipleStatements: false,
    });
    logger.ok(`Conectado a ${label}`, { host: params.host, database: params.database });
    return conn;
  } catch (err) {
    logger.error(`Falha ao conectar a ${label}`, { host: params.host, error: String(err) });
    throw err;
  }
}

/**
 * Reconecta se a conexão caiu (equivalente a ensure_connected do legado, usado antes
 * de cada tabela para sobreviver a cópias de dados longas — ver migracao-de-tabelas/requirements.md,
 * Requisitos Não Funcionais).
 */
export async function ensureConnected(
  conn: MigrationConnection,
  label: string,
  params: ConnectionParams,
): Promise<MigrationConnection> {
  try {
    await conn.ping();
    return conn;
  } catch {
    logger.warn(`Conexão com ${label} caiu, reconectando`);
    await conn.end().catch(() => undefined);
    return connect(label, params);
  }
}
