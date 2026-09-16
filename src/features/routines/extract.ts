import type { RowDataPacket } from "mysql2/promise";
import type { MigrationConnection } from "../../core/connectionManager.js";

/**
 * Porte de fetch_routines (migrate_routines.py:345-381).
 */

export interface ExtractedRoutine {
  name: string;
  type: "PROCEDURE" | "FUNCTION";
  definer: string;
  charset: string;
  collation: string;
  dbCollation: string;
  sqlMode: string;
  ddlOriginal: string | null;
  extractError: string | null;
}

export async function fetchRoutines(conn: MigrationConnection, database: string): Promise<ExtractedRoutine[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT
        ROUTINE_NAME        AS name,
        ROUTINE_TYPE        AS type,
        DEFINER             AS definer,
        CHARACTER_SET_CLIENT AS charset,
        COLLATION_CONNECTION AS collation,
        DATABASE_COLLATION   AS dbCollation,
        SQL_MODE             AS sqlMode
     FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = ?
     ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
    [database],
  );

  const routines: ExtractedRoutine[] = [];
  for (const row of rows as any[]) {
    let ddlOriginal: string | null = null;
    let extractError: string | null = null;
    try {
      const showSql =
        row.type === "PROCEDURE"
          ? `SHOW CREATE PROCEDURE \`${database}\`.\`${row.name}\``
          : `SHOW CREATE FUNCTION \`${database}\`.\`${row.name}\``;
      const [ddlRows] = await conn.query<RowDataPacket[]>(showSql);
      const ddlRow = (ddlRows as any[])[0];
      // índice 2 = "Create Procedure"/"Create Function" (mesma posição do legado, ddl_row[2])
      ddlOriginal = ddlRow ? Object.values(ddlRow)[2] as string : null;
    } catch (err) {
      extractError = String(err);
    }

    routines.push({
      name: row.name,
      type: row.type,
      definer: row.definer,
      charset: row.charset,
      collation: row.collation,
      dbCollation: row.dbCollation,
      sqlMode: row.sqlMode,
      ddlOriginal,
      extractError,
    });
  }
  return routines;
}
