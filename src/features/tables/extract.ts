import type { RowDataPacket } from "mysql2/promise";
import type { MigrationConnection } from "../../core/connectionManager.js";

/** Porte de fetch_tables (migrate_routines.py:388-418). */

export interface ExtractedTable {
  name: string;
  engine: string | null;
  approxRows: number | null;
  collation: string;
  ddlOriginal: string | null;
  extractError: string | null;
}

export async function fetchTables(conn: MigrationConnection, database: string): Promise<ExtractedTable[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT
        TABLE_NAME      AS name,
        ENGINE          AS engine,
        TABLE_ROWS      AS approxRows,
        TABLE_COLLATION AS collation
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [database],
  );

  const tables: ExtractedTable[] = [];
  for (const row of rows as any[]) {
    let ddlOriginal: string | null = null;
    let extractError: string | null = null;
    try {
      const [ddlRows] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${database}\`.\`${row.name}\``);
      const ddlRow = (ddlRows as any[])[0];
      // índice 1 = "Create Table" (mesma posição do legado, ddl_row[1])
      ddlOriginal = ddlRow ? (Object.values(ddlRow)[1] as string) : null;
    } catch (err) {
      extractError = String(err);
    }

    tables.push({
      name: row.name,
      engine: row.engine,
      approxRows: row.approxRows,
      collation: row.collation,
      ddlOriginal,
      extractError,
    });
  }
  return tables;
}
