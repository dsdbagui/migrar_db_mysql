import mysql from "mysql2/promise";

/**
 * Pool de conexão para o App DB (estado da própria aplicação: perfis, jobs, histórico).
 * Não confundir com core/connectionManager.ts, que conecta aos bancos MySQL de
 * origem/destino sendo migrados — esses são schemas arbitrários informados em tempo de
 * execução, nunca configurados via variável de ambiente.
 */
let pool: mysql.Pool | undefined;

export function getAppDb(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.APP_DB_HOST ?? "127.0.0.1",
      port: Number(process.env.APP_DB_PORT ?? 3306),
      user: process.env.APP_DB_USER ?? "root",
      password: process.env.APP_DB_PASSWORD ?? "",
      database: process.env.APP_DB_NAME ?? "app_migracao",
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

export async function closeAppDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
