import type { MigrationConnection } from "../../core/connectionManager.js";

/** Equivalente table-específico de drop_if_exists (migrate_routines.py:717-725) — engole exceção. */
export async function dropTableIfExists(conn: MigrationConnection, database: string, name: string): Promise<void> {
  try {
    await conn.query(`DROP TABLE IF EXISTS \`${database}\`.\`${name}\``);
  } catch {
    // idem ao legado: falha ao dropar não é reportada, só ignorada
  }
}
