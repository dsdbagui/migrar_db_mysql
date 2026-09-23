import type { Feature, PreviewItem } from "../api.js";

/**
 * Estado do wizard (RF-02..RF-06, NFR Usabilidade) — singleton em memória, vivo enquanto
 * a SPA não recarrega a página. Isso já satisfaz "preservar o preenchimento ao voltar
 * para uma etapa anterior dentro da mesma sessão de navegador" (T018): como as etapas
 * são telas da mesma aplicação (sem reload de página), o objeto nunca é descartado ao
 * navegar entre elas — só um `resetWizard()` explícito (início de uma nova migração) o
 * reinicia.
 */

export interface RoutinesOptions {
  newDefiner: string;
  dropExisting: boolean;
}

export interface TablesOptions {
  copyData: boolean;
  skipCreate: boolean;
  forceInnodb: boolean;
  restoreRemovedFks: boolean;
  createDatabaseIfMissing: boolean;
  filters: Record<string, string>;
  columnDefaults: Record<string, Record<string, string>>;
}

export interface WizardState {
  feature: Feature | null;
  sourceProfileId: string | null;
  targetProfileId: string | null;
  /**
   * _reversa_forward/005-perfil-conexao-por-usuario (D-05): banco de origem/destino desta migração,
   * informado na Etapa 1 — o perfil de conexão não guarda mais banco, e a Etapa 2 já precisa do
   * banco de origem para listar os itens disponíveis.
   */
  sourceDatabase: string;
  targetDatabase: string;
  select: "all" | string[];
  routinesOptions: RoutinesOptions;
  tablesOptions: TablesOptions;
  /** "assinatura" da seleção+opções no momento do último preview bem-sucedido (RN-02). */
  previewFingerprint: string | null;
  previewItems: PreviewItem[] | null;
  jobId: string | null;
}

function initialState(): WizardState {
  return {
    feature: null,
    sourceProfileId: null,
    targetProfileId: null,
    sourceDatabase: "",
    targetDatabase: "",
    select: "all",
    routinesOptions: { newDefiner: "", dropExisting: true },
    tablesOptions: {
      copyData: true,
      skipCreate: false,
      forceInnodb: false,
      restoreRemovedFks: true,
      createDatabaseIfMissing: false,
      filters: {},
      columnDefaults: {},
    },
    previewFingerprint: null,
    previewItems: null,
    jobId: null,
  };
}

let state: WizardState = initialState();

export function getWizardState(): WizardState {
  return state;
}

export function resetWizard(): void {
  state = initialState();
}

export function updateWizardState(patch: Partial<WizardState>): void {
  state = { ...state, ...patch };
}

/** Fingerprint da combinação feature+origem+seleção+opções — usado para invalidar o preview (RN-02). */
export function currentFingerprint(): string {
  const options = state.feature === "tables" ? state.tablesOptions : state.routinesOptions;
  return JSON.stringify({
    feature: state.feature,
    sourceProfileId: state.sourceProfileId,
    sourceDatabase: state.sourceDatabase,
    select: state.select,
    options,
  });
}

export function isPreviewStale(): boolean {
  return state.previewFingerprint !== currentFingerprint();
}

export function recordPreview(items: PreviewItem[]): void {
  state.previewItems = items;
  state.previewFingerprint = currentFingerprint();
}
