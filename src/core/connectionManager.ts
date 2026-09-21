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

/**
 * _reversa_forward/002-timeout-conexao-job/requirements.md (RN-01, decidido em /reversa-clarify
 * 2026-09-21): 30s de timeout de conexão — maior que o connection_timeout=10 do legado
 * (migrate_routines.py:248-253) por escolha explícita do operador, não paridade estrita.
 */
export const DEFAULT_CONNECT_TIMEOUT_MS = 30000;

/** RN-02: retry fixo, sem backoff, decidido em /reversa-clarify (2026-09-21). */
export const MAX_CONNECT_ATTEMPTS = 3;

/** RF-05: nenhum valor ausente/zero/negativo pode resultar em "sem timeout". */
export function resolveConnectTimeout(value?: number | null): number {
  if (value == null || value <= 0) return DEFAULT_CONNECT_TIMEOUT_MS;
  return value;
}

/**
 * RF-01/RF-04/RF-06: até MAX_CONNECT_ATTEMPTS tentativas, sem backoff, cada uma respeitando
 * DEFAULT_CONNECT_TIMEOUT_MS. Loga cada tentativa; propaga o último erro se todas falharem.
 * connectWithAutoCreateDatabase e ensureConnected reaproveitam esta função (D-01/D-02) — o
 * timeout e o retry valem para toda conexão aberta neste módulo, sem duplicar a lógica.
 */
export async function connect(label: string, params: ConnectionParams): Promise<MigrationConnection> {
  const connectTimeout = resolveConnectTimeout(DEFAULT_CONNECT_TIMEOUT_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      const conn = await mysql.createConnection({
        host: params.host,
        port: params.port,
        user: params.user,
        password: params.password,
        database: params.database,
        multipleStatements: false,
        connectTimeout,
      });
      logger.ok(`Conectado a ${label}`, {
        host: params.host,
        database: params.database,
        attempt,
        of: MAX_CONNECT_ATTEMPTS,
      });
      return conn;
    } catch (err) {
      lastError = err;
      logger.warn(`Falha ao conectar a ${label} (tentativa ${attempt}/${MAX_CONNECT_ATTEMPTS})`, {
        host: params.host,
        error: String(err),
      });
    }
  }

  logger.error(`Falha ao conectar a ${label} após ${MAX_CONNECT_ATTEMPTS} tentativas`, {
    host: params.host,
    error: String(lastError),
  });
  throw lastError;
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
 * RF-03: o driver mysql2 não aceita timeout nativo em `Connection.ping()` — se o servidor
 * parou de responder sem fechar o socket, ping() pode nunca resolver nem rejeitar (era
 * justamente o cenário do DEBT-001 original para ensureConnected). Envolve a promessa num
 * teto de tempo manual, descartando a perdedora.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`Tempo excedido (${ms}ms)`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Reconecta se a conexão caiu (equivalente a ensure_connected do legado, usado antes
 * de cada tabela para sobreviver a cópias de dados longas — ver migracao-de-tabelas/requirements.md,
 * Requisitos Não Funcionais). RF-03/D-02: o ping() em si respeita o mesmo teto de
 * DEFAULT_CONNECT_TIMEOUT_MS, e a reconexão delega para connect() (já com retry).
 */
export async function ensureConnected(
  conn: MigrationConnection,
  label: string,
  params: ConnectionParams,
): Promise<MigrationConnection> {
  const timeout = resolveConnectTimeout(DEFAULT_CONNECT_TIMEOUT_MS);
  try {
    await withTimeout(conn.ping(), timeout, () => {
      logger.warn(`Ping a ${label} não respondeu dentro de ${timeout}ms`, { host: params.host });
    });
    return conn;
  } catch {
    logger.warn(`Conexão com ${label} caiu, reconectando`, { host: params.host });
    await conn.end().catch(() => undefined);
    return connect(label, params);
  }
}
