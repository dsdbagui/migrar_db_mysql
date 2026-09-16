import type { RowDataPacket } from "mysql2/promise";
import { makeIssue, type Issue } from "../../core/issue.js";
import type { MigrationConnection } from "../../core/connectionManager.js";

const BATCH_SIZE = 500; // migrate_routines.py:54

/** Porte de _resolve_default_value (migrate_routines.py:984-988). */
export function resolveDefaultValue(raw: string): string {
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "hoje" || normalized === "today") {
    return new Date().toISOString().slice(0, 10);
  }
  return raw;
}

/** Porte de _sql_literal (migrate_routines.py:991-992). */
export function sqlLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Porte do bloco "Valores padrão de coluna configurados" de main() (migrate_routines.py:1912-1931).
 * Divergência deliberada do legado (BR-MIGRAR-011 / RF-10, decisão de revisão): falha isolada
 * numa coluna gera uma Issue `COLUMN_DEFAULT_FAILED` (warning) visível no relatório, em vez de
 * só um `warn()` de terminal — o legado só emitia `COLUMN_DEFAULT_SET` (info) no sucesso.
 */
export async function applyColumnDefaults(
  conn: MigrationConnection,
  database: string,
  tableName: string,
  columnDefaults: Record<string, string>,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const [columnName, defaultVal] of Object.entries(columnDefaults)) {
    try {
      await conn.query(
        `ALTER TABLE \`${database}\`.\`${tableName}\` ALTER COLUMN \`${columnName}\` SET DEFAULT ${sqlLiteral(defaultVal)}`,
      );
      issues.push(
        makeIssue(
          "COLUMN_DEFAULT_SET",
          "info",
          `DEFAULT '${defaultVal}' definido em \`${columnName}\` — evita erro de NULL em NOT NULL ao copiar dados`,
          `\`${columnName}\` sem DEFAULT`,
          `DEFAULT ${sqlLiteral(defaultVal)}`,
        ),
      );
    } catch (err) {
      issues.push(
        makeIssue(
          "COLUMN_DEFAULT_FAILED",
          "warning",
          `Não foi possível definir DEFAULT em \`${tableName}\`.\`${columnName}\`: ${String(err)}`,
          `\`${columnName}\` sem DEFAULT`,
          "(falhou)",
        ),
      );
    }
  }
  return issues;
}

/** Porte de copy_table_data (migrate_routines.py:995-1070), sem a barra de progresso de terminal. */
export async function copyTableData(
  srcConn: MigrationConnection,
  dstConn: MigrationConnection,
  srcDb: string,
  dstDb: string,
  tableName: string,
  whereClause?: string,
  columnDefaults?: Record<string, string>,
): Promise<{ rowsCopied: number; error: string | null }> {
  try {
    let selectSql = `SELECT * FROM \`${srcDb}\`.\`${tableName}\``;
    if (whereClause) selectSql += ` WHERE ${whereClause}`;

    const [rows, fields] = await srcConn.query<RowDataPacket[]>(selectSql);
    const columns = fields.map((f) => f.name);
    const colList = columns.map((c) => `\`${c}\``).join(", ");

    const defaultPositions = Object.entries(columnDefaults ?? {})
      .map(([col, val]) => [columns.indexOf(col), val] as const)
      .filter(([idx]) => idx >= 0);

    const applyDefaults = (row: any[]): any[] => {
      if (defaultPositions.length === 0) return row;
      const fixed = [...row];
      for (const [idx, val] of defaultPositions) {
        if (fixed[idx] === null) fixed[idx] = val;
      }
      return fixed;
    };

    let total = 0;
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batchRows = rows.slice(offset, offset + BATCH_SIZE).map((row) => applyDefaults(columns.map((c) => row[c])));
      if (batchRows.length === 0) continue;
      const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`;
      const insertSql = `INSERT INTO \`${dstDb}\`.\`${tableName}\` (${colList}) VALUES ${batchRows.map(() => rowPlaceholder).join(", ")}`;
      await dstConn.query(insertSql, batchRows.flat());
      total += batchRows.length;
    }

    return { rowsCopied: total, error: null };
  } catch (err) {
    return { rowsCopied: 0, error: String(err) };
  }
}
