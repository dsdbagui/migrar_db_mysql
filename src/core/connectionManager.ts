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
 * Porte de create_db_if_missing (migrate_routines.py, ask_connection com create_db_if_missing=True
 * para o destino) — reage ao erro 1049 ("Unknown database") criando o banco e reconectando.
 * No legado isso era uma pergunta reativa de terminal; na web vira um flag pré-declarado no
 * formulário do job (BR-DESCARTAR-002 em discard_log.md, watch W002 em regression-watch.md).
 */
export async function connectWithAutoCreateDatabase(
  label: string,
  params: ConnectionParams,
  createIfMissing: boolean,
): Promise<MigrationConnection> {
  try {
    return await connect(label, params);
  } catch (err) {
    const errno = (err as { errno?: number })?.errno;
    if (!createIfMissing || errno !== 1049 || !params.database) throw err;

    logger.warn(`Banco '${params.database}' não existe em ${label}, criando`, { host: params.host });
    const bootstrapConn = await connect(label, { ...params, database: undefined });
    try {
      await bootstrapConn.query(
        `CREATE DATABASE \`${params.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      );
    } finally {
      await bootstrapConn.end().catch(() => undefined);
    }
    return connect(label, params);
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
