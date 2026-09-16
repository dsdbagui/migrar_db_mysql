import type { MigrationConnection } from "../../core/connectionManager.js";
import type { Issue } from "../../core/issue.js";
import { FK_ERROR_CODES, stripForeignKeys, dropReferencingFks, type FkSpec } from "./fkRecovery.js";

export interface ApplyTableResult {
  error: string | null;
  ddlApplied: string;
  issues: Issue[];
  fkSpecs: FkSpec[];
}

function extractErrno(err: unknown): number | undefined {
  return (err as { errno?: number })?.errno;
}

/**
 * Porte de apply_table (migrate_routines.py:839-898). Duas estratégias de recuperação
 * de FK, em ordem: (1) a própria tabela declara a FK problemática, (2) uma FK órfã de
 * outra tabela ainda aponta para esta. FOREIGN_KEY_CHECKS=0 é responsabilidade do
 * chamador (service.ts), setado uma vez para todo o job — igual ao legado.
 */
export async function applyTable(conn: MigrationConnection, database: string, ddl: string): Promise<ApplyTableResult> {
  try {
    await conn.query(`USE \`${database}\``);
    await conn.query(ddl);
    return { error: null, ddlApplied: ddl, issues: [], fkSpecs: [] };
  } catch (err) {
    const errno = extractErrno(err);
    if (!errno || !FK_ERROR_CODES.has(errno)) {
      return { error: String(err), ddlApplied: ddl, issues: [], fkSpecs: [] };
    }

    let lastError = String(err);
    let currentDdl = ddl;
    const issues: Issue[] = [];
    const fkSpecs: FkSpec[] = [];

    const tableNameMatch = ddl.match(/CREATE TABLE\s+`([^`]+)`/i);
    const tableName = tableNameMatch?.[1];

    if (/FOREIGN KEY/i.test(currentDdl)) {
      const stripped = stripForeignKeys(currentDdl);
      if (stripped.ddl !== currentDdl) {
        const strippedSpecs: FkSpec[] = stripped.fkSpecs.map((s) => ({ ...s, childTable: tableName ?? "" }));
        try {
          await conn.query(stripped.ddl);
          return { error: null, ddlApplied: stripped.ddl, issues: stripped.issues, fkSpecs: strippedSpecs };
        } catch (err2) {
          lastError = String(err2);
          currentDdl = stripped.ddl;
          issues.push(...stripped.issues);
          fkSpecs.push(...strippedSpecs);
        }
      }
    }

    if (tableName) {
      const { dropped, issues: dropIssues } = await dropReferencingFks(conn, database, tableName);
      if (dropped.length > 0) {
        try {
          await conn.query(currentDdl);
          return { error: null, ddlApplied: currentDdl, issues: [...issues, ...dropIssues], fkSpecs: [...fkSpecs, ...dropped] };
        } catch (err3) {
          lastError = String(err3);
          issues.push(...dropIssues);
          fkSpecs.push(...dropped);
        }
      }
    }

    return { error: lastError, ddlApplied: ddl, issues, fkSpecs };
  }
}
