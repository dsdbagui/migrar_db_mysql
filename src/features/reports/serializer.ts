import { getAppDb } from "../../core/db/appDb.js";
import type { Issue } from "../../core/issue.js";
import {
  deriveRoutineType,
  deriveTableEngine,
  deriveTableMode,
  type RoutineType,
  type TableMode,
  type TablesJobParamsLike,
} from "./deriveMetadata.js";

/**
 * Serializador único do relatório de job (BR-MIGRAR-016, `target_business_rules.md`) —
 * decisão de revisão do legado: consolidar `report.json`/`report.html`/`migration.sql`
 * (+`retry_*.sql`) numa única fonte de dados (`ReportData`) em vez de três funções de
 * renderização independentes (ver `_reversa_sdd/relatorios-de-migracao/design.md`).
 *
 * Diferença estrutural do legado: `report_data` lá era montado em memória, dentro do
 * mesmo processo de `main()`, a partir de `routine_results`/`table_results`. Aqui é
 * reconstruído a qualquer momento a partir do que já está persistido em `job_items`/
 * `job_item_fk_specs` (App DB) — o job pode ter terminado muito antes da consulta ao
 * relatório (`interfaces/relatorio-de-job.md`).
 */

export interface RoutineReportItem {
  name: string;
  type: RoutineType;
  applied: boolean;
  skipped: boolean;
  applyError: string | null;
  issues: Issue[];
}

export interface TableReportItem {
  name: string;
  engine: string;
  mode: TableMode;
  applied: boolean;
  skipped: boolean;
  rowsCopied: number | null;
  applyError: string | null;
  copyError: string | null;
  issues: Issue[];
}

export interface ReportData {
  jobId: string;
  timestamp: string;
  sourceDb: string | null;
  destinationDb: string | null;
  routines: { total: number; applied: number; errors: number; skipped: number; items: RoutineReportItem[] };
  tables: {
    total: number;
    applied: number;
    errors: number;
    skipped: number;
    rowsCopied: number;
    items: TableReportItem[];
  };
}

export interface GeneratedReport {
  reportJson: ReportData;
  reportHtml: string;
  migrationSql: string;
  retrySql: string | null;
}

interface SqlItem {
  itemType: "routine" | "table";
  name: string;
  ddlFixed: string | null;
  applyError: string | null;
  issueCodes: string[];
}

interface JobRow {
  id: string;
  feature: string;
  status: string;
  params_json: TablesJobParamsLike & Record<string, unknown>;
  source_db: string | null;
  destination_db: string | null;
}

interface JobItemRow {
  item_type: "routine" | "table" | "collation_routine";
  name: string;
  applied: 0 | 1;
  skipped: 0 | 1;
  apply_error: string | null;
  copy_error: string | null;
  rows_copied: number | null;
  ddl_original: string | null;
  ddl_fixed: string | null;
  issues_json: Issue[];
}

async function fetchJob(jobId: string): Promise<JobRow | null> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    // _reversa_forward/005-perfil-conexao-por-usuario (D-07): o banco de cada lado é do job, não
    // mais do perfil (connection_profiles.database_name deixou de existir em 005_*.sql).
    // target_database '' é o DEFAULT de jobs anteriores a 006_*.sql — sem banco conhecido.
    `SELECT j.id, j.feature, j.status, j.params_json,
            j.source_database AS source_db, NULLIF(j.target_database, '') AS destination_db
     FROM migration_jobs j
     WHERE j.id = ?`,
    [jobId],
  );
  const row = (rows as any[])[0];
  return row ?? null;
}

async function fetchItems(jobId: string): Promise<JobItemRow[]> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    `SELECT item_type, name, applied, skipped, apply_error, copy_error, rows_copied,
            ddl_original, ddl_fixed, issues_json
     FROM job_items WHERE job_id = ?`,
    [jobId],
  );
  return rows as JobItemRow[];
}

/**
 * Monta o `ReportData` (equivalente ao `report_data` legado) e a lista plana usada para
 * gerar `migration.sql`/`retry_*.sql`. Retorna `null` se o job não existir.
 */
export async function buildReportData(
  jobId: string,
): Promise<{ data: ReportData; sqlItems: SqlItem[] } | null> {
  const job = await fetchJob(jobId);
  if (!job) return null;

  const items = await fetchItems(jobId);
  const params = job.params_json ?? {};

  const routineItems: RoutineReportItem[] = [];
  const tableItems: TableReportItem[] = [];
  const sqlItems: SqlItem[] = [];

  for (const item of items) {
    const issues = item.issues_json ?? [];
    if (item.item_type === "routine") {
      routineItems.push({
        name: item.name,
        type: deriveRoutineType(item.ddl_fixed ?? item.ddl_original),
        applied: !!item.applied,
        skipped: !!item.skipped,
        applyError: item.apply_error,
        issues,
      });
      sqlItems.push({
        itemType: "routine",
        name: item.name,
        ddlFixed: item.ddl_fixed,
        applyError: item.apply_error,
        issueCodes: issues.map((i) => i.code),
      });
    } else if (item.item_type === "table") {
      tableItems.push({
        name: item.name,
        engine: deriveTableEngine(params, item.ddl_fixed ?? item.ddl_original),
        mode: deriveTableMode(params),
        applied: !!item.applied,
        skipped: !!item.skipped,
        rowsCopied: item.rows_copied,
        applyError: item.apply_error,
        copyError: item.copy_error,
        issues,
      });
      sqlItems.push({
        itemType: "table",
        name: item.name,
        ddlFixed: item.ddl_fixed,
        applyError: item.apply_error,
        issueCodes: issues.map((i) => i.code),
      });
    }
    // item_type "collation_routine" fica fora do relatório desta entrega — a feature
    // collation-fix não tem UI nesta rodada (decisão de escopo, requirements.md § Esclarecimentos).
  }

  const data: ReportData = {
    jobId: job.id,
    timestamp: new Date().toISOString(),
    sourceDb: job.source_db,
    destinationDb: job.destination_db,
    routines: {
      total: routineItems.length,
      applied: routineItems.filter((i) => i.applied).length,
      errors: routineItems.filter((i) => i.applyError != null).length,
      skipped: routineItems.filter((i) => i.skipped).length,
      items: routineItems,
    },
    tables: {
      total: tableItems.length,
      applied: tableItems.filter((i) => i.applied).length,
      errors: tableItems.filter((i) => i.applyError != null).length,
      skipped: tableItems.filter((i) => i.skipped).length,
      rowsCopied: tableItems.reduce((sum, i) => sum + (i.rowsCopied ?? 0), 0),
      items: tableItems,
    },
  };

  return { data, sqlItems };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderItemsTable(title: string, rows: Array<{ name: string; status: string; issues: Issue[] }>): string {
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${r.issues.map((i) => `<span class="issue ${i.severity}">${escapeHtml(i.code)}</span>`).join(" ")}</td>
      </tr>`,
    )
    .join("\n");
  return `<h2>${escapeHtml(title)}</h2>
  <table>
    <thead><tr><th>Nome</th><th>Status</th><th>Issues</th></tr></thead>
    <tbody>${body || '<tr><td colspan="3">Nenhum item</td></tr>'}</tbody>
  </table>`;
}

/** HTML autocontido (sem CDN, sem build step) — mesma filosofia do `render_html_report` legado. */
export function renderHtmlReport(data: ReportData): string {
  const routineRows = data.routines.items.map((i) => ({
    name: `${i.name} (${i.type})`,
    status: i.applied ? "aplicado" : i.skipped ? "pulado" : i.applyError ? `erro: ${i.applyError}` : "pendente",
    issues: i.issues,
  }));
  const tableRows = data.tables.items.map((i) => ({
    name: `${i.name} (${i.engine}, ${i.mode})`,
    status: i.applied
      ? `aplicado${i.rowsCopied != null ? `, ${i.rowsCopied} linha(s) copiada(s)` : ""}`
      : i.skipped
        ? "pulado"
        : i.applyError
          ? `erro: ${i.applyError}`
          : "pendente",
    issues: i.issues,
  }));

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<title>Relatório de migração — job ${escapeHtml(data.jobId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; font-size: 0.9rem; }
  th { background: #f0f0f0; }
  .issue { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem; margin: 0 2px; }
  .issue.error { background: #fde2e2; color: #900; }
  .issue.warning { background: #fff3cd; color: #856404; }
  .issue.info { background: #e2f0fd; color: #044; }
</style>
</head>
<body>
  <h1>Relatório de migração</h1>
  <p><strong>Job:</strong> ${escapeHtml(data.jobId)} — gerado em ${escapeHtml(data.timestamp)}</p>
  <p><strong>Origem:</strong> ${escapeHtml(data.sourceDb ?? "n/a")} &rarr; <strong>Destino:</strong> ${escapeHtml(data.destinationDb ?? "n/a")}</p>
  <p>Rotinas: ${data.routines.applied}/${data.routines.total} aplicadas, ${data.routines.errors} erro(s), ${data.routines.skipped} pulada(s)</p>
  <p>Tabelas: ${data.tables.applied}/${data.tables.total} aplicadas, ${data.tables.errors} erro(s), ${data.tables.skipped} pulada(s), ${data.tables.rowsCopied} linha(s) copiada(s)</p>
  ${renderItemsTable("Rotinas", routineRows)}
  ${renderItemsTable("Tabelas", tableRows)}
</body>
</html>`;
}

/** Tabelas primeiro, depois rotinas — mesma ordem do `migration.sql` legado (design.md § Fluxo Principal). */
export function renderMigrationSql(sqlItems: SqlItem[]): string {
  const lines: string[] = ["SET FOREIGN_KEY_CHECKS=0;", ""];
  for (const item of sqlItems.filter((i) => i.itemType === "table" && i.ddlFixed)) {
    lines.push(`-- Tabela: ${item.name}${item.issueCodes.length ? ` (issues: ${item.issueCodes.join(", ")})` : ""}`);
    lines.push(`${item.ddlFixed};`, "");
  }
  for (const item of sqlItems.filter((i) => i.itemType === "routine" && i.ddlFixed)) {
    lines.push(`-- Rotina: ${item.name}${item.issueCodes.length ? ` (issues: ${item.issueCodes.join(", ")})` : ""}`);
    lines.push(`${item.ddlFixed};`, "");
  }
  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  return lines.join("\n");
}

/**
 * `null` quando não há item com erro — espelha o legado, que só gera `retry_*.sql`
 * quando existem erros (design.md § Fluxos Alternativos).
 * Tabelas ganham `DROP TABLE IF EXISTS` antes do `CREATE` (BR-MIGRAR-018); rotinas não
 * precisam, pois já usam `DROP ... IF EXISTS` opcional no fluxo normal.
 */
export function renderRetrySql(sqlItems: SqlItem[]): string | null {
  const failed = sqlItems.filter((i) => i.applyError != null && i.ddlFixed);
  if (failed.length === 0) return null;

  const lines: string[] = ["SET FOREIGN_KEY_CHECKS=0;", ""];
  for (const item of failed.filter((i) => i.itemType === "table")) {
    lines.push(`-- Retry tabela: ${item.name} (erro original: ${item.applyError})`);
    lines.push(`DROP TABLE IF EXISTS \`${item.name}\`;`);
    lines.push(`${item.ddlFixed};`, "");
  }
  for (const item of failed.filter((i) => i.itemType === "routine")) {
    lines.push(`-- Retry rotina: ${item.name} (erro original: ${item.applyError})`);
    lines.push(`${item.ddlFixed};`, "");
  }
  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  return lines.join("\n");
}

export async function generateReport(jobId: string): Promise<GeneratedReport | null> {
  const built = await buildReportData(jobId);
  if (!built) return null;
  const { data, sqlItems } = built;
  return {
    reportJson: data,
    reportHtml: renderHtmlReport(data),
    migrationSql: renderMigrationSql(sqlItems),
    retrySql: renderRetrySql(sqlItems),
  };
}
