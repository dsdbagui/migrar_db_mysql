/**
 * Deriva metadados de exibição do relatório (RF-10) que `job_items` não persiste hoje —
 * ver `_reversa_forward/001-frontend-wizard-migracao-web/data-delta.md` § "Nota — campos
 * ausentes em job_items para paridade total".
 *
 * Ajuste feito durante a execução do actions.md (T005): o plano original previa derivar
 * tudo de `migration_jobs.params_json`, mas o tipo de rotina (PROCEDURE/FUNCTION) não é
 * capturado ali — só existe no próprio texto do DDL, que já é persistido em
 * `job_items.ddl_fixed`/`ddl_original`. Continua sem exigir nova migração de schema.
 */

export type RoutineType = "PROCEDURE" | "FUNCTION" | "DESCONHECIDO";

export function deriveRoutineType(ddl: string | null | undefined): RoutineType {
  if (!ddl) return "DESCONHECIDO";
  if (/\bPROCEDURE\b/i.test(ddl)) return "PROCEDURE";
  if (/\bFUNCTION\b/i.test(ddl)) return "FUNCTION";
  return "DESCONHECIDO";
}

export interface TablesJobParamsLike {
  copyData?: boolean;
  forceInnodb?: boolean;
}

export type TableMode = "schema-only" | "com-dados";

export function deriveTableMode(params: TablesJobParamsLike | null | undefined): TableMode {
  return params?.copyData ? "com-dados" : "schema-only";
}

export function deriveTableEngine(
  params: TablesJobParamsLike | null | undefined,
  ddl: string | null | undefined,
): string {
  if (params?.forceInnodb) return "InnoDB";
  const match = ddl?.match(/\bENGINE\s*=\s*(\w+)/i);
  return match?.[1] ?? "desconhecido";
}
