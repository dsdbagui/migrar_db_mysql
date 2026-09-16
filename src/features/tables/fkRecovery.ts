import type { RowDataPacket } from "mysql2/promise";
import { makeIssue, type Issue } from "../../core/issue.js";
import type { MigrationConnection } from "../../core/connectionManager.js";
import type { FkSpecResult } from "../../core/jobRunner.js";

/**
 * FK Recovery Engine — porte 1:1 de strip_foreign_keys, find_referencing_fks,
 * drop_referencing_fks e resolve_pending_foreign_keys (migrate_routines.py:648-982).
 * Núcleo de negócio mais complexo do projeto (ADR-0002, BR-MIGRAR-006).
 */

/**
 * Códigos de erro do MySQL que indicam "não foi possível criar a FK por falta de
 * unique key compatível na tabela referenciada" — o gatilho da recuperação automática.
 *
 * DIVERGÊNCIA VERIFICADA DO LEGADO: migrate_routines.py:758 usa FK_ERROR_CODES = {1215, 6125}.
 * Testado contra MySQL 8.0.46 real (verificação desta implementação): o mesmo cenário que
 * o legado documenta (FK referenciando coluna sem UNIQUE/PRIMARY KEY no pai) retorna
 * **erro 1822** ("Missing index for constraint ... in the referenced table"), não 1215 nem 6125.
 * Isso sugere que a recuperação automática de FK do legado — BR-MIGRAR-006, o núcleo de
 * negócio mais complexo do projeto — pode nunca disparar contra versões atuais do MySQL 8,
 * silenciosamente (RISK-001 em risk_register.md, materializado aqui). 1215 é mantido para
 * versões/engines onde o erro genérico ainda ocorre; 1822 foi adicionado por evidência
 * direta. 6125 não foi possível reproduzir e é mantido por precaução (pode ser específico
 * de uma versão de MySQL não testada aqui).
 */
export const FK_ERROR_CODES = new Set([1215, 1822, 6125]);

const FK_CONSTRAINT_PATTERN =
  /,\s*CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+(?:`[^`]+`\.)?`([^`]+)`\s*\(([^)]*)\)([^,)]*)/gi;

function parseColList(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim().replace(/`/g, ""))
    .filter((c) => c.length > 0);
}

export interface FkSpec {
  fkName: string;
  childTable: string;
  childCols: string[];
  refTable: string;
  refCols: string[];
  extra: string;
}

export function stripForeignKeys(ddl: string): { ddl: string; issues: Issue[]; fkSpecs: Omit<FkSpec, "childTable">[] } {
  const issues: Issue[] = [];
  const fkSpecs: Omit<FkSpec, "childTable">[] = [];

  const newDdl = ddl.replace(FK_CONSTRAINT_PATTERN, (full, fkName, childCols, refTable, refCols, extra) => {
    issues.push(
      makeIssue(
        "FK_REMOVED",
        "warning",
        `FOREIGN KEY \`${fkName}\` (→ \`${refTable}\`) removida — tabela referenciada não tem unique key compatível no MySQL 8`,
        full.trim(),
        "(removida)",
      ),
    );
    fkSpecs.push({
      fkName,
      childCols: parseColList(childCols),
      refTable,
      refCols: parseColList(refCols),
      extra: extra.trim(),
    });
    return "";
  });

  return { ddl: newDdl, issues, fkSpecs };
}

export async function findReferencingFks(conn: MigrationConnection, database: string, tableName: string): Promise<FkSpec[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?
     ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    [database, database, tableName],
  );

  const rulesByName = new Map<string, { updateRule: string; deleteRule: string }>();
  if (rows.length > 0) {
    const [ruleRows] = await conn.query<RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME, TABLE_NAME, UPDATE_RULE, DELETE_RULE
       FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?`,
      [database, tableName],
    );
    for (const r of ruleRows as any[]) {
      rulesByName.set(`${r.TABLE_NAME}::${r.CONSTRAINT_NAME}`, { updateRule: r.UPDATE_RULE, deleteRule: r.DELETE_RULE });
    }
  }

  const specs = new Map<string, FkSpec>();
  for (const row of rows as any[]) {
    const key = `${row.TABLE_NAME}::${row.CONSTRAINT_NAME}`;
    let spec = specs.get(key);
    if (!spec) {
      spec = {
        fkName: row.CONSTRAINT_NAME,
        childTable: row.TABLE_NAME,
        childCols: [],
        refTable: tableName,
        refCols: [],
        extra: "",
      };
      specs.set(key, spec);
    }
    spec.childCols.push(row.COLUMN_NAME);
    spec.refCols.push(row.REFERENCED_COLUMN_NAME);
  }

  for (const [key, spec] of specs) {
    const rules = rulesByName.get(key);
    let extra = "";
    if (rules?.deleteRule && rules.deleteRule !== "RESTRICT") extra += ` ON DELETE ${rules.deleteRule}`;
    if (rules?.updateRule && rules.updateRule !== "RESTRICT") extra += ` ON UPDATE ${rules.updateRule}`;
    spec.extra = extra.trim();
  }

  return [...specs.values()];
}

export async function dropReferencingFks(
  conn: MigrationConnection,
  database: string,
  tableName: string,
): Promise<{ dropped: FkSpec[]; issues: Issue[] }> {
  const specs = await findReferencingFks(conn, database, tableName);
  const dropped: FkSpec[] = [];
  const issues: Issue[] = [];

  for (const spec of specs) {
    try {
      await conn.query(`ALTER TABLE \`${database}\`.\`${spec.childTable}\` DROP FOREIGN KEY \`${spec.fkName}\``);
      dropped.push(spec);
      issues.push(
        makeIssue(
          "FK_REMOVED",
          "warning",
          `FOREIGN KEY \`${spec.fkName}\` em \`${spec.childTable}\` (→ \`${tableName}\`) removida temporariamente — uma FK órfã (de execução anterior) impedia recriar \`${tableName}\``,
          `FK \`${spec.fkName}\` em \`${spec.childTable}\``,
          "(removida)",
        ),
      );
    } catch {
      // idem ao legado: falha ao dropar uma FK órfã específica não interrompe as demais
    }
  }

  return { dropped, issues };
}

export interface FkResolutionOutcome extends FkSpecResult {
  detail: string;
}

/**
 * Porte de resolve_pending_foreign_keys (migrate_routines.py:901-981). Roda com
 * FOREIGN_KEY_CHECKS=0 (setado pelo chamador em service.ts) — por isso dados órfãos
 * pré-existentes não bloqueiam a criação da constraint.
 */
export async function resolvePendingForeignKeys(
  conn: MigrationConnection,
  database: string,
  pendingFks: FkSpec[],
): Promise<FkResolutionOutcome[]> {
  const results: FkResolutionOutcome[] = [];

  for (const fk of pendingFks) {
    const refColList = fk.refCols.map((c) => `\`${c}\``).join(", ");
    const notNullClause = fk.refCols.map((c) => `\`${c}\` IS NOT NULL`).join(" AND ");
    const base: FkResolutionOutcome = {
      fkName: fk.fkName,
      childTable: fk.childTable,
      refTable: fk.refTable,
      childCols: fk.childCols,
      refCols: fk.refCols,
      extra: fk.extra,
      restored: false,
      detail: "",
    };

    let dup: unknown;
    try {
      const [dupRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${refColList} FROM \`${database}\`.\`${fk.refTable}\` WHERE ${notNullClause} GROUP BY ${refColList} HAVING COUNT(*) > 1 LIMIT 1`,
      );
      dup = (dupRows as any[])[0];
    } catch (err) {
      results.push({ ...base, detail: `Não foi possível checar duplicidade em \`${fk.refTable}\`: ${String(err)}` });
      continue;
    }

    if (dup) {
      results.push({
        ...base,
        detail: `\`${fk.refTable}\` tem valores duplicados em (${refColList}) — não é seguro criar UNIQUE KEY; FK não restaurada`,
      });
      continue;
    }

    const ukName = `uk_${fk.refTable}_${fk.refCols.join("_")}`.slice(0, 64);
    try {
      await conn.query(`ALTER TABLE \`${database}\`.\`${fk.refTable}\` ADD UNIQUE KEY \`${ukName}\` (${refColList})`);
    } catch (err) {
      results.push({ ...base, detail: `Falha ao criar UNIQUE KEY em \`${fk.refTable}\`: ${String(err)}` });
      continue;
    }

    const childColList = fk.childCols.map((c) => `\`${c}\``).join(", ");
    try {
      await conn.query(
        `ALTER TABLE \`${database}\`.\`${fk.childTable}\` ADD CONSTRAINT \`${fk.fkName}\` FOREIGN KEY (${childColList}) REFERENCES \`${database}\`.\`${fk.refTable}\` (${refColList}) ${fk.extra}`,
      );
      results.push({ ...base, restored: true, detail: `UNIQUE KEY \`${ukName}\` criada em \`${fk.refTable}\` e FK restaurada` });
    } catch (err) {
      results.push({
        ...base,
        detail: `UNIQUE KEY \`${ukName}\` criada em \`${fk.refTable}\`, mas a FK não pôde ser restaurada: ${String(err)}`,
      });
    }
  }

  return results;
}
