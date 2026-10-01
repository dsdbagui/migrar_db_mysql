import type { Connection as CoreConnection } from "mysql2";
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

/**
 * Porte de copy_table_data (migrate_routines.py:995-1070), sem a barra de progresso de terminal.
 *
 * Lê a origem em streaming, não com um único `SELECT *` materializado: carregar a tabela inteira
 * em memória derrubou o processo por heap esgotado (FATAL ERROR: JavaScript heap out of memory)
 * numa tabela de ~3 milhões de linhas / 1,2 GB. Com o stream, o for-await só puxa o próximo lote
 * depois que o INSERT anterior terminou — o mysql2 pausa a leitura do socket enquanto isso, então
 * o consumo de memória fica limitado a ~um lote, independente do tamanho da tabela.
 *
 * Sair do loop por erro destrói o stream; o mysql2 então retoma o socket e descarta o restante do
 * resultado (Query#stream, _destroy), deixando a conexão de origem utilizável para a próxima tabela.
 */
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

    // A API promise não expõe stream(); a conexão callback subjacente (presente em runtime em
    // PromiseConnection#connection, mas fora dos typings de mysql2/promise) expõe.
    const coreConn = (srcConn as unknown as { connection: CoreConnection }).connection;
    const stream = coreConn.query(selectSql).stream({ highWaterMark: BATCH_SIZE });
    let columns: string[] | null = null;
    stream.once("fields", (fields: { name: string }[]) => {
      columns = fields.map((f) => f.name);
    });

    let total = 0;
    let batch: RowDataPacket[] = [];
    let flushBatch: ((rows: RowDataPacket[]) => Promise<void>) | null = null;

    const buildFlush = (cols: string[]): ((rows: RowDataPacket[]) => Promise<void>) => {
      const colList = cols.map((c) => `\`${c}\``).join(", ");
      const rowPlaceholder = `(${cols.map(() => "?").join(", ")})`;
      const defaultPositions = Object.entries(columnDefaults ?? {})
        .map(([col, val]) => [cols.indexOf(col), val] as const)
        .filter(([idx]) => idx >= 0);

      const applyDefaults = (row: any[]): any[] => {
        for (const [idx, val] of defaultPositions) {
          if (row[idx] === null) row[idx] = val;
        }
        return row;
      };

      return async (rows) => {
        const values = rows.map((row) => applyDefaults(cols.map((c) => row[c])));
        const insertSql = `INSERT INTO \`${dstDb}\`.\`${tableName}\` (${colList}) VALUES ${values.map(() => rowPlaceholder).join(", ")}`;
        await dstConn.query(insertSql, values.flat());
        total += values.length;
      };
    };

    for await (const row of stream as AsyncIterable<RowDataPacket>) {
      batch.push(row);
      if (batch.length < BATCH_SIZE) continue;
      flushBatch ??= buildFlush(columns ?? Object.keys(row));
      await flushBatch(batch);
      batch = [];
    }
    if (batch.length > 0) {
      flushBatch ??= buildFlush(columns ?? Object.keys(batch[0]!));
      await flushBatch(batch);
    }

    return { rowsCopied: total, error: null };
  } catch (err) {
    return { rowsCopied: 0, error: String(err) };
  }
}
