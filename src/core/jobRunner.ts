import { randomUUID } from "node:crypto";
import { getAppDb } from "./db/appDb.js";
import { logger } from "./logger.js";
import type { Issue } from "./issue.js";
import type { ConnectionParams } from "./connectionManager.js";
import { resolveForConnection } from "./credentialVault.js";

/**
 * Job Runner — core/jobRunner.ts (target_architecture.md, AD-01).
 *
 * Executa o pipeline de uma feature em background, dentro do próprio processo,
 * SEM fila/broker externo (decisão híbrida de paradigma — paradigm_decision.md).
 * Persiste cada JobItem assim que processado em job_items, não só ao final do job —
 * isso é a mitigação de RISK-004 (retomada de job após crash do servidor):
 * um job "running" que nunca terminou pode ser retomado pulando os itens já concluídos
 * (ver getProcessedNames, usado pelos services de feature para filtrar o que falta).
 */

export type MigrationFeature = "routines" | "tables" | "config" | "reports" | "collation_fix";
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type JobItemType = "routine" | "table" | "collation_routine";

export interface FkSpecResult {
  fkName: string;
  childTable: string;
  childCols: string[];
  refTable: string;
  refCols: string[];
  extra: string;
  restored: boolean;
}

export interface JobItemResult {
  itemType: JobItemType;
  name: string;
  applied: boolean;
  skipped: boolean;
  applyError?: string | null;
  extractError?: string | null;
  rowsCopied?: number | null;
  copyError?: string | null;
  ddlOriginal?: string | null;
  ddlFixed?: string | null;
  issues: Issue[];
  fkSpecs?: FkSpecResult[];
}

export interface FeatureRunContext {
  jobId: string;
  params: Record<string, unknown>;
  sourceParams?: ConnectionParams;
  targetParams: ConnectionParams;
  /** Nomes de itens já persistidos com status terminal — o service deve pulá-los (retomada de job). */
  alreadyProcessed: Set<string>;
  /** Chamar assim que cada item terminar de ser processado — persiste incrementalmente. */
  onItem: (item: JobItemResult) => Promise<void>;
  /**
   * _reversa_forward/003-cancelamento-de-job (D-01): consulta se um POST /jobs/:id/cancel
   * já marcou este job como cancelled. Cada FeatureRunner deve checar entre itens do seu
   * loop e parar (sem lançar erro) quando retornar true — cancelamento cooperativo, não
   * interrompe uma query já em execução (RN-03).
   */
  isCancelled: () => Promise<boolean>;
}

export type FeatureRunner = (ctx: FeatureRunContext) => Promise<void>;

export interface CreateJobInput {
  feature: MigrationFeature;
  params: Record<string, unknown>;
  sourceProfileId?: string;
  targetProfileId: string;
  /** _reversa_forward/005-perfil-conexao-por-usuario (D-07): o banco vem do job, não do perfil. */
  sourceDatabase?: string;
  targetDatabase: string;
  /** Identidade do usuário da sessão que disparou o job (RN-04) — nunca texto livre do cliente. */
  createdBy: string;
}

export async function createJob(input: CreateJobInput): Promise<string> {
  const db = getAppDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO migration_jobs
       (id, feature, source_profile_id, source_database, target_profile_id, target_database, status, params_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id,
      input.feature,
      input.sourceProfileId ?? null,
      input.sourceDatabase ?? null,
      input.targetProfileId,
      input.targetDatabase,
      JSON.stringify(input.params),
      input.createdBy,
    ],
  );
  return id;
}

/**
 * FKs removidas durante a criação das tabelas deste job, ainda não restauradas —
 * consumido por features/tables/service.ts após todas as tabelas serem processadas
 * (BR-MIGRAR-006 / ADR-0002: restaurar só depois que os dados já foram carregados).
 */
export async function getPendingFkSpecs(jobId: string): Promise<
  Array<{
    jobItemId: string;
    fkName: string;
    childTable: string;
    childCols: string[];
    refTable: string;
    refCols: string[];
    extra: string;
  }>
> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    `SELECT s.id AS spec_id, s.job_item_id, s.fk_name, s.child_table, s.child_cols, s.ref_table, s.ref_cols, s.extra
     FROM job_item_fk_specs s
     JOIN job_items i ON i.id = s.job_item_id
     WHERE i.job_id = ? AND s.restored = FALSE`,
    [jobId],
  );
  return (rows as any[]).map((r) => ({
    jobItemId: r.job_item_id,
    fkName: r.fk_name,
    childTable: r.child_table,
    childCols: r.child_cols,
    refTable: r.ref_table,
    refCols: r.ref_cols,
    extra: r.extra,
  }));
}

/** Aplica o desfecho de uma tentativa de restauração de FK: atualiza a spec e anexa Issue ao item. */
export async function applyFkResolutionOutcome(
  jobItemId: string,
  fkName: string,
  childTable: string,
  restored: boolean,
  issue: Issue,
): Promise<void> {
  const db = getAppDb();
  await db.query(
    `UPDATE job_item_fk_specs SET restored = ? WHERE job_item_id = ? AND fk_name = ? AND child_table = ?`,
    [restored, jobItemId, fkName, childTable],
  );
  const [rows] = await db.query<any[]>("SELECT issues_json FROM job_items WHERE id = ?", [jobItemId]);
  const current: Issue[] = (rows as any[])[0]?.issues_json ?? [];
  current.push(issue);
  await db.query("UPDATE job_items SET issues_json = ? WHERE id = ?", [JSON.stringify(current), jobItemId]);
}

export async function getProcessedNames(jobId: string): Promise<Set<string>> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>(
    `SELECT name FROM job_items WHERE job_id = ? AND (applied = TRUE OR skipped = TRUE OR apply_error IS NOT NULL)`,
    [jobId],
  );
  return new Set((rows as { name: string }[]).map((r) => r.name));
}

async function persistItem(jobId: string, item: JobItemResult): Promise<void> {
  const db = getAppDb();
  const itemId = randomUUID();
  await db.query(
    `INSERT INTO job_items
       (id, job_id, item_type, name, applied, skipped, apply_error, extract_error,
        rows_copied, copy_error, ddl_original, ddl_fixed, issues_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      itemId,
      jobId,
      item.itemType,
      item.name,
      item.applied,
      item.skipped,
      item.applyError ?? null,
      item.extractError ?? null,
      item.rowsCopied ?? null,
      item.copyError ?? null,
      item.ddlOriginal ?? null,
      item.ddlFixed ?? null,
      JSON.stringify(item.issues),
    ],
  );

  if (item.fkSpecs?.length) {
    for (const fk of item.fkSpecs) {
      await db.query(
        `INSERT INTO job_item_fk_specs
           (id, job_item_id, fk_name, child_table, child_cols, ref_table, ref_cols, extra, restored)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          itemId,
          fk.fkName,
          fk.childTable,
          JSON.stringify(fk.childCols),
          fk.refTable,
          JSON.stringify(fk.refCols),
          fk.extra,
          fk.restored,
        ],
      );
    }
  }
}

/**
 * Roda (ou retoma) um job. Não usa fila — a chamada roda o pipeline sequencial da feature
 * dentro do processo atual. O chamador (routes.ts) dispara isso sem `await` (fire-and-forget)
 * para devolver 202 imediatamente ao cliente HTTP.
 */
export async function runJob(jobId: string, runner: FeatureRunner): Promise<void> {
  const db = getAppDb();
  const [rows] = await db.query<any[]>("SELECT * FROM migration_jobs WHERE id = ?", [jobId]);
  const job = (rows as any[])[0];
  if (!job) throw new Error(`Job ${jobId} não encontrado`);

  await db.query(
    `UPDATE migration_jobs SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
    [jobId],
  );

  const alreadyProcessed = await getProcessedNames(jobId);
  // _reversa_forward/005-perfil-conexao-por-usuario (D-04/D-07): o banco de cada lado vem das
  // colunas do próprio job. target_database '' é o DEFAULT de jobs anteriores a 006_*.sql.
  const targetParams = await resolveForConnection(job.target_profile_id, job.target_database || undefined);
  const sourceParams = job.source_profile_id
    ? await resolveForConnection(job.source_profile_id, job.source_database ?? undefined)
    : undefined;

  const isCancelled = async (): Promise<boolean> => {
    const [statusRows] = await db.query<any[]>("SELECT status FROM migration_jobs WHERE id = ?", [jobId]);
    return (statusRows as any[])[0]?.status === "cancelled";
  };

  try {
    await runner({
      jobId,
      // mysql2 já desserializa colunas JSON automaticamente — não fazer JSON.parse de novo.
      params: job.params_json,
      sourceParams,
      targetParams,
      alreadyProcessed,
      onItem: (item) => persistItem(jobId, item),
      isCancelled,
    });
    // D-02 (_reversa_forward/003-cancelamento-de-job/roadmap.md): "AND status = 'running'" evita
    // sobrescrever um job que foi cancelado (POST /jobs/:id/cancel) enquanto runner() ainda estava
    // em voo — sem essa guarda, esse UPDATE reverteria 'cancelled' de volta para 'completed'.
    await db.query(
      `UPDATE migration_jobs SET status = 'completed', finished_at = NOW() WHERE id = ? AND status = 'running'`,
      [jobId],
    );
    logger.ok(`Job ${jobId} concluído`);
  } catch (err) {
    // D-03 (_reversa_forward/002-timeout-conexao-job/roadmap.md): antes desta feature não havia
    // onde persistir o motivo da falha — migration_jobs não tinha coluna de erro, e o logger só
    // escreve em stdout. Sem isso, "failed" era visível mas nunca explicado.
    // D-02 (_reversa_forward/003-cancelamento-de-job): mesma guarda "AND status = 'running'" do
    // caminho de sucesso acima, pelo mesmo motivo.
    const message = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE migration_jobs SET status = 'failed', finished_at = NOW(), error_message = ? WHERE id = ? AND status = 'running'`,
      [message, jobId],
    );
    logger.error(`Job ${jobId} falhou`, { error: message });
    throw err;
  }
}

export async function getJobStatus(jobId: string): Promise<{
  id: string;
  feature: MigrationFeature;
  status: JobStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  items: Array<{
    itemType: JobItemType;
    name: string;
    applied: boolean;
    skipped: boolean;
    applyError: string | null;
    rowsCopied: number | null;
    issues: Issue[];
  }>;
} | null> {
  const db = getAppDb();
  const [jobRows] = await db.query<any[]>("SELECT * FROM migration_jobs WHERE id = ?", [jobId]);
  const job = (jobRows as any[])[0];
  if (!job) return null;

  const [itemRows] = await db.query<any[]>(
    "SELECT item_type, name, applied, skipped, apply_error, rows_copied, issues_json FROM job_items WHERE job_id = ?",
    [jobId],
  );

  return {
    id: job.id,
    feature: job.feature,
    status: job.status,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    errorMessage: job.error_message ?? null,
    items: (itemRows as any[]).map((r) => ({
      itemType: r.item_type,
      name: r.name,
      applied: !!r.applied,
      skipped: !!r.skipped,
      applyError: r.apply_error,
      rowsCopied: r.rows_copied,
      issues: r.issues_json,
    })),
  };
}
