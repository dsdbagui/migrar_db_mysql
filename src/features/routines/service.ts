import { connect, ensureConnected, DESTINATION_CHARSET, type ConnectionParams } from "../../core/connectionManager.js";
import type { FeatureRunContext, JobItemResult } from "../../core/jobRunner.js";
import { fetchRoutines, type ExtractedRoutine } from "./extract.js";
import { transformRoutine } from "./transform.js";
import { dropIfExists, applyRoutine } from "./apply.js";

/**
 * Orquestração da feature `routines` — equivalente ao bloco "ROTINAS" de main()
 * em migrate_routines.py (:1554-1680), sem a parte interativa (seleção/confirmação
 * já vieram resolvidas no payload do job, ver core/jobRunner.ts).
 */

export interface RoutinesJobParams {
  select: "all" | string[];
  newDefiner?: string;
  dropExisting: boolean;
}

export async function previewRoutines(
  sourceParams: ConnectionParams,
  params: RoutinesJobParams,
): Promise<{ name: string; type: string; issues: ReturnType<typeof transformRoutine>["issues"] }[]> {
  const conn = await connect("ORIGEM (preview)", sourceParams);
  try {
    const routines = await fetchRoutines(conn, sourceParams.database ?? "");
    const selected = selectRoutines(routines, params.select);
    return selected
      .filter((r) => r.ddlOriginal)
      .map((r) => {
        const { issues } = transformRoutine(r.ddlOriginal as string, params.newDefiner);
        return { name: r.name, type: r.type, issues };
      });
  } finally {
    await conn.end().catch(() => undefined);
  }
}

function selectRoutines(routines: ExtractedRoutine[], select: "all" | string[]): ExtractedRoutine[] {
  if (select === "all") return routines;
  const wanted = new Set(select);
  return routines.filter((r) => wanted.has(r.name));
}

export async function runRoutinesJob(ctx: FeatureRunContext): Promise<void> {
  const params = ctx.params as unknown as RoutinesJobParams;
  if (!ctx.sourceParams) throw new Error("Feature 'routines' requer conexão de origem");

  // BUG-20260925-EXY2: charset só no DESTINO — a ORIGEM pode ser um MySQL 5.x.
  const destParams: ConnectionParams = { ...ctx.targetParams, charset: DESTINATION_CHARSET };

  let srcConn = await connect("ORIGEM", ctx.sourceParams);
  let dstConn = await connect("DESTINO", destParams);

  try {
    const routines = await fetchRoutines(srcConn, ctx.sourceParams.database ?? "");
    const selected = selectRoutines(routines, params.select).filter((r) => !ctx.alreadyProcessed.has(r.name));

    for (const routine of selected) {
      // Cancelamento cooperativo (_reversa_forward/003-cancelamento-de-job, RN-03): checa entre
      // itens, não interrompe uma query já em execução.
      if (await ctx.isCancelled()) break;

      srcConn = await ensureConnected(srcConn, "ORIGEM", ctx.sourceParams);
      dstConn = await ensureConnected(dstConn, "DESTINO", destParams);

      const item: JobItemResult = {
        itemType: "routine",
        name: routine.name,
        applied: false,
        skipped: false,
        issues: [],
        ddlOriginal: routine.ddlOriginal,
        extractError: routine.extractError,
      };

      if (!routine.ddlOriginal) {
        item.skipped = true;
        item.applyError = `DDL indisponível: ${routine.extractError ?? "desconhecido"}`;
        await ctx.onItem(item);
        continue;
      }

      const { ddl: ddlFixed, issues } = transformRoutine(routine.ddlOriginal, params.newDefiner);
      item.ddlFixed = ddlFixed;
      item.issues = issues;

      if (params.dropExisting) {
        await dropIfExists(dstConn, ctx.targetParams.database ?? "", routine.name, routine.type);
      }

      const error = await applyRoutine(dstConn, ctx.targetParams.database ?? "", ddlFixed);
      if (error) {
        item.applyError = error;
      } else {
        item.applied = true;
      }

      await ctx.onItem(item);
    }
  } finally {
    await srcConn.end().catch(() => undefined);
    await dstConn.end().catch(() => undefined);
  }
}
