import { api } from "../../api.js";
import { getWizardState, updateWizardState } from "../../state/wizardState.js";
import { friendlyError } from "../../lib/errorMessages.js";

/**
 * Disparo do job (RF-06) — chamado pelo botão "Confirmar" da Etapa 4 (Step4Preview.ts).
 * Fica em arquivo próprio porque é uma ação de negócio (não apenas renderização), reflete
 * o ID `T014` do `actions.md`.
 */
export interface SubmitResult {
  ok: boolean;
  jobId?: string;
  errorMessage?: string;
}

export async function submitJob(): Promise<SubmitResult> {
  const state = getWizardState();
  if (!state.feature || !state.sourceProfileId || !state.targetProfileId) {
    return { ok: false, errorMessage: "Etapas anteriores incompletas." };
  }

  const res =
    state.feature === "routines"
      ? await api.createRoutinesJob({
          sourceProfileId: state.sourceProfileId,
          targetProfileId: state.targetProfileId,
          select: state.select,
          newDefiner: state.routinesOptions.newDefiner || undefined,
          dropExisting: state.routinesOptions.dropExisting,
        })
      : await api.createTablesJob({
          sourceProfileId: state.sourceProfileId,
          targetProfileId: state.targetProfileId,
          select: state.select,
          copyData: state.tablesOptions.copyData,
          skipCreate: state.tablesOptions.skipCreate,
          forceInnodb: state.tablesOptions.forceInnodb,
          restoreRemovedFks: state.tablesOptions.restoreRemovedFks,
          filters: Object.keys(state.tablesOptions.filters).length ? state.tablesOptions.filters : undefined,
          columnDefaults: Object.keys(state.tablesOptions.columnDefaults).length
            ? state.tablesOptions.columnDefaults
            : undefined,
        });

  if (!res.ok || !res.data) {
    return { ok: false, errorMessage: friendlyError(res.status, "job") };
  }

  updateWizardState({ jobId: res.data.id });
  return { ok: true, jobId: res.data.id };
}
