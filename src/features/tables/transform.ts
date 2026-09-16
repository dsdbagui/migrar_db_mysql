import { makeIssue, type Issue } from "../../core/issue.js";
import type { Transformation } from "../routines/transform.js";

/**
 * Porte 1:1 de TABLE_TRANSFORMATIONS + transform_table_ddl (migrate_routines.py:575-710).
 */

export const fixTableTypeKeyword: Transformation = (ddl) => {
  if (!/\bTYPE\s*=\s*\w+/i.test(ddl)) return [ddl, null];
  const newDdl = ddl.replace(/\bTYPE\s*=\s*(\w+)/gi, "ENGINE=$1");
  return [newDdl, makeIssue("TYPE_TO_ENGINE", "error", "TYPE= é inválido no MySQL 8 — substituído por ENGINE=", "TYPE=", "ENGINE=")];
};

export const fixTableUtf8: Transformation = (ddl) => {
  let newDdl = ddl;
  // Collations primeiro: utf8_xxx -> utf8mb4_xxx
  newDdl = newDdl.replace(/\butf8_/gi, "utf8mb4_");
  // Charset: utf8 (mas não utf8mb4 já existente)
  newDdl = newDdl.replace(/\butf8\b(?!mb)/gi, "utf8mb4");
  if (newDdl !== ddl) {
    return [newDdl, makeIssue("UTF8_CHARSET", "warning", "charset utf8 → utf8mb4 (utf8mb3 deprecado no MySQL 8)", "utf8", "utf8mb4")];
  }
  return [ddl, null];
};

export const fixTableMyisamOptions: Transformation = (ddl) => {
  const patterns = [/PACK_KEYS\s*=\s*\d/i, /DELAY_KEY_WRITE\s*=\s*\d/i, /CHECKSUM\s*=\s*\d/i];
  const found: string[] = [];
  let newDdl = ddl;
  for (const pattern of patterns) {
    const match = newDdl.match(pattern);
    if (match) {
      found.push(match[0]);
      newDdl = newDdl.replace(new RegExp(`\\s*${pattern.source}`, "i"), "");
    }
  }
  if (found.length > 0) {
    return [newDdl, makeIssue("MYISAM_OPTIONS", "warning", `Opções MyISAM removidas: ${found.join(", ")}`, found.join(", "), "(removidas)")];
  }
  return [ddl, null];
};

export const fixTableEngineToInnodb: Transformation = (ddl) => {
  const match = ddl.match(/\bENGINE\s*=\s*(\w+)/i);
  const currentEngine = match?.[1];
  if (currentEngine && currentEngine.toUpperCase() !== "INNODB") {
    const newDdl = ddl.replace(/\bENGINE\s*=\s*\w+/gi, "ENGINE=InnoDB");
    return [newDdl, makeIssue("ENGINE_TO_INNODB", "warning", `ENGINE=${currentEngine} → ENGINE=InnoDB`, `ENGINE=${currentEngine}`, "ENGINE=InnoDB")];
  }
  return [ddl, null];
};

export const fixTableZerofill: Transformation = (ddl) => {
  if (!/\bZEROFILL\b/i.test(ddl)) return [ddl, null];
  return [ddl, makeIssue("ZEROFILL", "warning", "ZEROFILL está deprecado no MySQL 8.0.17 — considere remover", "ZEROFILL", "(sem alteração automática)")];
};

export const fixTableIntDisplayWidth: Transformation = (ddl) => {
  // Preserva TINYINT(1) — convenção de boolean em ORMs (comentário original do legado).
  const pattern = /\b(SMALLINT|MEDIUMINT|BIGINT|INT)\s*\(\d+\)/i;
  if (!pattern.test(ddl)) return [ddl, null];
  const newDdl = ddl.replace(new RegExp(pattern.source, "gi"), (_m, type: string) => type.toUpperCase());
  return [newDdl, makeIssue("INT_DISPLAY_WIDTH", "info", "Display width de inteiros removido (deprecado no MySQL 8.0.17)", "INT(N)", "INT")];
};

/** Ordem fixa — mesma de TABLE_TRANSFORMATIONS (migrate_routines.py:690-696). */
export const TABLE_TRANSFORMATIONS: Transformation[] = [
  fixTableTypeKeyword,
  fixTableUtf8,
  fixTableMyisamOptions,
  fixTableZerofill,
  fixTableIntDisplayWidth,
];

export function transformTableDdl(ddl: string, forceInnodb = false): { ddl: string; issues: Issue[] } {
  const issues: Issue[] = [];
  let current = ddl;
  for (const transform of TABLE_TRANSFORMATIONS) {
    const [next, issue] = transform(current);
    current = next;
    if (issue) issues.push(issue);
  }
  if (forceInnodb) {
    const [next, issue] = fixTableEngineToInnodb(current);
    current = next;
    if (issue) issues.push(issue);
  }
  return { ddl: current, issues };
}
