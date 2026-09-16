import { makeIssue, type Issue } from "../../core/issue.js";

/**
 * Porte 1:1 de remove_definer + as 8 funções da lista TRANSFORMATIONS
 * (migrate_routines.py:434-552). Cada função é pura: (ddl) -> (ddl, Issue | null).
 * BR-MIGRAR-001, BR-MIGRAR-002 em target_business_rules.md — nenhuma mudança de
 * comportamento em relação ao legado, só a linguagem de implementação.
 */

export type Transformation = (ddl: string) => [string, Issue | null];

export function removeDefiner(ddl: string, newDefiner?: string): [string, Issue | null] {
  const pattern = /DEFINER\s*=\s*`[^`]*`\s*@\s*`[^`]*`\s*/i;
  const match = ddl.match(pattern);
  if (!match) return [ddl, null];

  const originalDefiner = match[0].trim();
  const globalPattern = new RegExp(pattern.source, "gi");

  if (newDefiner) {
    const replacement = `DEFINER=${newDefiner} `;
    const newDdl = ddl.replace(globalPattern, replacement);
    return [
      newDdl,
      makeIssue("DEFINER_REPLACED", "info", `DEFINER substituído por ${newDefiner}`, originalDefiner, replacement.trim()),
    ];
  }

  const newDdl = ddl.replace(globalPattern, "");
  return [newDdl, makeIssue("DEFINER_REMOVED", "info", "DEFINER removido", originalDefiner, "(sem DEFINER)")];
}

export const fixSetOption: Transformation = (ddl) => {
  const pattern = /\bSET\s+OPTION\b/i;
  if (!pattern.test(ddl)) return [ddl, null];
  const newDdl = ddl.replace(new RegExp(pattern.source, "gi"), "SET");
  return [newDdl, makeIssue("SET_OPTION", "error", "SET OPTION é inválido no MySQL 8 — substituído por SET", "SET OPTION", "SET")];
};

export const fixOldPasswordHash: Transformation = (ddl) => {
  if (!/\bOLD_PASSWORD\s*\(/i.test(ddl)) return [ddl, null];
  return [
    ddl,
    makeIssue(
      "OLD_PASSWORD",
      "error",
      "OLD_PASSWORD() removido no MySQL 8 — substitua por PASSWORD() ou SHA2()",
      "OLD_PASSWORD()",
      "(sem alteração automática — requer revisão manual)",
    ),
  ];
};

export const cleanSqlMode: Transformation = (ddl) => {
  if (!/NO_AUTO_CREATE_USER/i.test(ddl)) return [ddl, null];
  const newDdl = ddl.replace(/,?\s*NO_AUTO_CREATE_USER/gi, "");
  return [
    newDdl,
    makeIssue(
      "SQL_MODE_NO_AUTO_CREATE_USER",
      "error",
      "NO_AUTO_CREATE_USER removido do sql_mode (inválido no MySQL 8)",
      "NO_AUTO_CREATE_USER",
      "(removido)",
    ),
  ];
};

export const fixNoZeroDate: Transformation = (ddl) => {
  if (!/['"]0000-00-00/.test(ddl)) return [ddl, null];
  return [
    ddl,
    makeIssue(
      "ZERO_DATE",
      "warning",
      "Data '0000-00-00' encontrada — pode falhar com NO_ZERO_DATE no MySQL 8",
      "'0000-00-00'",
      "(sem alteração automática)",
    ),
  ];
};

export const fixGroupConcatMaxlen: Transformation = (ddl) => {
  if (!/GROUP_CONCAT\s*\(/i.test(ddl)) return [ddl, null];
  return [
    ddl,
    makeIssue(
      "GROUP_CONCAT",
      "warning",
      "GROUP_CONCAT encontrado — verifique group_concat_max_len no MySQL 8 (padrão 1024)",
      "GROUP_CONCAT(...)",
      "(sem alteração automática)",
    ),
  ];
};

export const fixSqlSecurity: Transformation = (ddl) => {
  if (!/SQL\s+SECURITY\s+DEFINER/i.test(ddl)) return [ddl, null];
  return [
    ddl,
    makeIssue(
      "SQL_SECURITY_DEFINER",
      "warning",
      "SQL SECURITY DEFINER encontrado — considere trocar para INVOKER no MySQL 8",
      "SQL SECURITY DEFINER",
      "(sem alteração automática)",
    ),
  ];
};

export const fixNoDefaultCharset: Transformation = (ddl) => {
  const pattern = /CHARACTER\s+SET\s+\w+\s*(?:COLLATE\s+\w+)?/i;
  const match = ddl.match(pattern);
  if (!match) return [ddl, null];
  const newDdl = ddl.replace(new RegExp(pattern.source, "gi"), "");
  return [
    newDdl,
    makeIssue(
      "CHARSET_INLINE",
      "warning",
      "CHARACTER SET inline removido (pode conflitar com collation do servidor MySQL 8)",
      match[0],
      "",
    ),
  ];
};

export const fixOnlyFullGroupBy: Transformation = (ddl) => {
  const hasGroup = /\bGROUP\s+BY\b/i.test(ddl);
  const hasSelectStar = /\bSELECT\b[\s\S]*\*/i.test(ddl);
  if (!hasGroup || !hasSelectStar) return [ddl, null];
  return [
    ddl,
    makeIssue(
      "ONLY_FULL_GROUP_BY",
      "warning",
      "SELECT * com GROUP BY pode violar ONLY_FULL_GROUP_BY (ativo por padrão no MySQL 8)",
      "SELECT * ... GROUP BY",
      "(sem alteração automática)",
    ),
  ];
};

/** Ordem fixa — mesma de TRANSFORMATIONS (migrate_routines.py:543-552). */
export const TRANSFORMATIONS: Transformation[] = [
  fixSetOption,
  fixOldPasswordHash,
  cleanSqlMode,
  fixNoZeroDate,
  fixGroupConcatMaxlen,
  fixSqlSecurity,
  fixNoDefaultCharset,
  fixOnlyFullGroupBy,
];

/** Garante que o DDL está pronto para execução direta (normalize_delimiter, migrate_routines.py:538). */
export function normalizeDelimiter(ddl: string): string {
  return ddl.trim().replace(/;+$/, "");
}

export function transformRoutine(ddl: string, newDefiner?: string): { ddl: string; issues: Issue[] } {
  const issues: Issue[] = [];

  let current = ddl;
  const [afterDefiner, definerIssue] = removeDefiner(current, newDefiner);
  current = afterDefiner;
  if (definerIssue) issues.push(definerIssue);

  for (const transform of TRANSFORMATIONS) {
    const [next, issue] = transform(current);
    current = next;
    if (issue) issues.push(issue);
  }

  return { ddl: normalizeDelimiter(current), issues };
}
