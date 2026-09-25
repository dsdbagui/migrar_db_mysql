/**
 * Issue — value object imutável.
 * Porte de `class Issue` (migrate_routines.py:425), agora sem mutação:
 * o legado usa `__init__` manual (não é dataclass, apesar do CLAUDE.md antigo dizer o contrário —
 * ver code-analysis.md). Aqui é um tipo imutável desde o início.
 *
 * `code` é um conjunto fechado catalogado em data-dictionary.md. `COLUMN_DEFAULT_FAILED` é novo
 * (BR-MIGRAR-011 / RF-10 de migracao-de-tabelas — decisão de revisão, sem equivalente no legado).
 */

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCode =
  | "DEFINER_REMOVED"
  | "DEFINER_REPLACED"
  | "SET_OPTION"
  | "OLD_PASSWORD"
  | "SQL_MODE_NO_AUTO_CREATE_USER"
  | "SQL_MODE_IGNORE_SPACE"
  | "ZERO_DATE"
  | "GROUP_CONCAT"
  | "SQL_SECURITY_DEFINER"
  | "CHARSET_INLINE"
  | "ONLY_FULL_GROUP_BY"
  | "TYPE_TO_ENGINE"
  | "UTF8_CHARSET"
  | "MYISAM_OPTIONS"
  | "ZEROFILL"
  | "INT_DISPLAY_WIDTH"
  | "ENGINE_TO_INNODB"
  | "FK_REMOVED"
  | "FK_RESTORED"
  | "FK_NOT_RESTORED"
  | "COLUMN_DEFAULT_SET"
  | "COLUMN_DEFAULT_FAILED";

export interface Issue {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly description: string;
  readonly original: string;
  readonly fixed: string;
}

export function makeIssue(
  code: IssueCode,
  severity: IssueSeverity,
  description: string,
  original: string,
  fixed: string,
): Issue {
  return Object.freeze({ code, severity, description, original, fixed });
}
