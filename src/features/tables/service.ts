import { makeIssue } from "../../core/issue.js";
import { connect, ensureConnected, type ConnectionParams } from "../../core/connectionManager.js";
import {
  getPendingFkSpecs,
  applyFkResolutionOutcome,
  type FeatureRunContext,
  type JobItemResult,
} from "../../core/jobRunner.js";
import { fetchTables, type ExtractedTable } from "./extract.js";
import { transformTableDdl } from "./transform.js";
import { applyTable } from "./apply.js";
import { applyColumnDefaults, copyTableData, resolveDefaultValue } from "./copyData.js";
import { resolvePendingForeignKeys } from "./fkRecovery.js";
import { dropTableIfExists } from "./dropTable.js";

/**
 * Orquestração da feature `tables` — equivalente ao bloco "TABELAS" de main()
 * em migrate_routines.py (:1686-1993), sem a parte interativa. Preserva a ordem
 * determinística "criar/copiar todas as tabelas → resolver FKs pendentes"
 * (implicação 2 de paradigm_decision.md), rastreada aqui como passos sequenciais
 * dentro do próprio job, não como coreografia de eventos.
 */

export interface TablesJobParams {
  select: "all" | string[];
  copyData: boolean;
  skipCreate: boolean;
  forceInnodb: boolean;
  dropExisting: boolean;
  filters?: Record<string, string>;
  columnDefaults?: Record<string, Record<string, string>>;
  restoreRemovedFks: boolean;
}

function selectTables(tables: ExtractedTable[], select: "all" | string[]): ExtractedTable[] {
  if (select === "all") return tables;
  const wanted = new Set(select);
  return tables.filter((t) => wanted.has(t.name));
}

export async function previewTables(
  sourceParams: ConnectionParams,
  params: Pick<TablesJobParams, "select" | "forceInnodb">,
): Promise<{ name: string; issues: ReturnType<typeof transformTableDdl>["issues"] }[]> {
  const conn = await connect("ORIGEM (preview)", sourceParams);
  try {
    const tables = await fetchTables(conn, sourceParams.database ?? "");
    const selected = selectTables(tables, params.select);
    return selected
      .filter((t) => t.ddlOriginal)
      .map((t) => {
        const { issues } = transformTableDdl(t.ddlOriginal as string, params.forceInnodb);
        return { name: t.name, issues };
      });
  } finally {
    await conn.end().catch(() => undefined);
  }
}

export async function runTablesJob(ctx: FeatureRunContext): Promise<void> {
  const params = ctx.params as unknown as TablesJobParams;
  if (!ctx.sourceParams) throw new Error("Feature 'tables' requer conexão de origem");

  let srcConn = await connect("ORIGEM", ctx.sourceParams);
  let dstConn = await connect("DESTINO", ctx.targetParams);
  const srcDb = ctx.sourceParams.database ?? "";
  const dstDb = ctx.targetParams.database ?? "";

  try {
    await dstConn.query("SET FOREIGN_KEY_CHECKS=0");

    const tables = await fetchTables(srcConn, srcDb);
    const selected = selectTables(tables, params.select).filter((t) => !ctx.alreadyProcessed.has(t.name));

    for (const table of selected) {
      srcConn = await ensureConnected(srcConn, "ORIGEM", ctx.sourceParams);
      dstConn = await ensureConnected(dstConn, "DESTINO", ctx.targetParams);

      const item: JobItemResult = {
        itemType: "table",
        name: table.name,
        applied: false,
        skipped: false,
        issues: [],
        ddlOriginal: table.ddlOriginal,
        extractError: table.extractError,
        rowsCopied: 0,
      };

      if (!table.ddlOriginal) {
        item.skipped = true;
        item.applyError = `DDL indisponível: ${table.extractError ?? "desconhecido"}`;
        await ctx.onItem(item);
        continue;
      }

      if (params.skipCreate) {
        item.applied = true;
      } else {
        const { ddl: ddlFixed, issues } = transformTableDdl(table.ddlOriginal, params.forceInnodb);
        item.ddlFixed = ddlFixed;
        item.issues.push(...issues);

        if (params.dropExisting) {
          await dropTableIfExists(dstConn, dstDb, table.name);
        }

        const applyResult = await applyTable(dstConn, dstDb, ddlFixed);
        item.issues.push(...applyResult.issues);
        item.fkSpecs = applyResult.fkSpecs.map((fk) => ({
          fkName: fk.fkName,
          childTable: fk.childTable,
          childCols: fk.childCols,
          refTable: fk.refTable,
          refCols: fk.refCols,
          extra: fk.extra,
          restored: false,
        }));

        if (applyResult.error) {
          item.applyError = applyResult.error;
        } else {
          item.applied = true;
        }
      }

      if (item.applied) {
        const colDefaultsRaw = params.columnDefaults?.[table.name];
        let resolvedDefaults: Record<string, string> | undefined;
        if (colDefaultsRaw) {
          resolvedDefaults = Object.fromEntries(
            Object.entries(colDefaultsRaw).map(([col, val]) => [col, resolveDefaultValue(val)]),
          );
          const defaultIssues = await applyColumnDefaults(dstConn, dstDb, table.name, resolvedDefaults);
          item.issues.push(...defaultIssues);
        }

        if (params.copyData) {
          const whereClause = params.filters?.[table.name];
          const { rowsCopied, error } = await copyTableData(
            srcConn,
            dstConn,
            srcDb,
            dstDb,
            table.name,
            whereClause,
            resolvedDefaults,
          );
          item.rowsCopied = rowsCopied;
          item.copyError = error;
        }
      }

      await ctx.onItem(item);
    }

    if (params.restoreRemovedFks) {
      const pending = await getPendingFkSpecs(ctx.jobId);
      if (pending.length > 0) {
        const outcomes = await resolvePendingForeignKeys(
          dstConn,
          dstDb,
          pending.map((p) => ({
            fkName: p.fkName,
            childTable: p.childTable,
            childCols: p.childCols,
            refTable: p.refTable,
            refCols: p.refCols,
            extra: p.extra,
          })),
        );
        for (let i = 0; i < outcomes.length; i += 1) {
          const outcome = outcomes[i]!;
          const spec = pending[i]!;
          const issue = outcome.restored
            ? makeIssue("FK_RESTORED", "info", outcome.detail, `FK ${outcome.fkName} pendente`, "restaurada")
            : makeIssue("FK_NOT_RESTORED", "warning", outcome.detail, `FK ${outcome.fkName} pendente`, "(não restaurada)");
          await applyFkResolutionOutcome(spec.jobItemId, outcome.fkName, outcome.childTable, outcome.restored, issue);
        }
      }
    }

    await dstConn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    await srcConn.end().catch(() => undefined);
    await dstConn.end().catch(() => undefined);
  }
}
