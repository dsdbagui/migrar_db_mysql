import type { MigrationConnection } from "../../core/connectionManager.js";

/** Porte de drop_if_exists (migrate_routines.py:717-725). Engole qualquer exceção — idempotência silenciosa. */
export async function dropIfExists(conn: MigrationConnection, database: string, name: string, rtype: "PROCEDURE" | "FUNCTION"): Promise<void> {
  try {
    await conn.query(`DROP ${rtype} IF EXISTS \`${database}\`.\`${name}\``);
  } catch {
    // idem ao legado: falha ao dropar não é reportada, só ignorada
  }
}

/** Porte de apply_routine (migrate_routines.py:728-740). Retorna null em sucesso, mensagem de erro em falha. */
export async function applyRoutine(conn: MigrationConnection, database: string, ddl: string): Promise<string | null> {
  try {
    await conn.query(`USE \`${database}\``);
    await conn.query(ddl);
    return null;
  } catch (err) {
    return String(err);
  }
}
