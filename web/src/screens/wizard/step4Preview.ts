import { api, type PreviewItem } from "../../api.js";
import { getWizardState, isPreviewStale, recordPreview } from "../../state/wizardState.js";
import { navigate } from "../../router.js";
import { renderWizardSteps } from "./steps.js";
import { friendlyError } from "../../lib/errorMessages.js";
import { submitJob } from "./confirmSubmit.js";

/**
 * Etapa 4 do wizard: preview/dry-run (RF-05) + confirmação final (RF-06, RN-02 — o botão
 * de confirmar só habilita depois de um preview que reflete a seleção/opções atuais).
 */
export function renderStep4(container: HTMLElement): void {
  const state = getWizardState();
  if (!state.feature || !state.sourceProfileId || !state.targetProfileId || !state.sourceDatabase || !state.targetDatabase) {
    navigate("/wizard/step1");
    return;
  }

  container.innerHTML = `
    ${renderWizardSteps(4)}
    <h1>Etapa 4 — Preview e confirmação</h1>
    <div id="preview-alert"></div>
    <div class="actions">
      <button type="button" class="secondary" id="back-btn">Voltar</button>
      <button type="button" id="run-preview-btn">Rodar preview</button>
      <button type="button" id="confirm-btn" disabled>Confirmar e iniciar migração</button>
    </div>
    <div id="preview-results"></div>
  `;

  const alertBox = container.querySelector<HTMLDivElement>("#preview-alert")!;
  const resultsBox = container.querySelector<HTMLDivElement>("#preview-results")!;
  const confirmBtn = container.querySelector<HTMLButtonElement>("#confirm-btn")!;

  container.querySelector<HTMLButtonElement>("#back-btn")!.addEventListener("click", () => navigate("/wizard/step3"));

  async function runPreview(): Promise<void> {
    confirmBtn.disabled = true;
    alertBox.innerHTML = "";
    resultsBox.innerHTML = "<p>Rodando preview…</p>";

    const currentState = getWizardState();
    const res =
      currentState.feature === "routines"
        ? await api.previewRoutines(currentState.sourceProfileId!, currentState.sourceDatabase, {
            select: currentState.select,
            newDefiner: currentState.routinesOptions.newDefiner || undefined,
          })
        : await api.previewTables(currentState.sourceProfileId!, currentState.sourceDatabase, {
            select: currentState.select,
            forceInnodb: currentState.tablesOptions.forceInnodb,
          });

    if (!res.ok || !res.data) {
      resultsBox.innerHTML = "";
      alertBox.innerHTML = `<div class="alert error">${friendlyError(res.status, "job")}</div>`;
      return;
    }

    warnAboutMissingNames(currentState.select, res.data.items);
    recordPreview(res.data.items);
    renderPreviewItems(res.data.items);
    confirmBtn.disabled = false;
  }

  /**
   * O backend simplesmente omite do preview qualquer nome selecionado que não exista
   * mais na origem (não sinaliza isso de forma alguma) — descoberto testando o fluxo
   * ponta a ponta desta feature. RF-03/BR-MIGRAR-012 exige que isso seja um aviso não
   * bloqueante, então a comparação é feita aqui, no cliente.
   */
  function warnAboutMissingNames(select: "all" | string[], items: PreviewItem[]): void {
    if (select === "all") return;
    const returnedNames = new Set(items.map((i) => i.name));
    const missing = select.filter((name) => !returnedNames.has(name));
    if (missing.length > 0) {
      alertBox.innerHTML = `<div class="alert warning">Não encontrado(s) na origem, ignorado(s) nesta migração: ${missing
        .map((n) => `<code>${n}</code>`)
        .join(", ")}</div>`;
    }
  }

  function renderPreviewItems(items: PreviewItem[]): void {
    const errorCount = items.reduce((n, i) => n + i.issues.filter((x) => x.severity === "error").length, 0);
    const warningCount = items.reduce((n, i) => n + i.issues.filter((x) => x.severity === "warning").length, 0);

    resultsBox.innerHTML = `
      <p>${items.length} item(ns) — ${errorCount} issue(s) de erro, ${warningCount} de aviso.</p>
      <table>
        <thead><tr><th>Nome</th><th>Issues</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `<tr>
              <td>${item.name}</td>
              <td>${item.issues.map((i) => `<span class="badge ${i.severity}">${i.code}</span>`).join(" ") || "—"}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  container.querySelector<HTMLButtonElement>("#run-preview-btn")!.addEventListener("click", () => {
    void runPreview();
  });

  confirmBtn.addEventListener("click", async () => {
    if (isPreviewStale()) {
      alertBox.innerHTML = `<div class="alert warning">As opções mudaram desde o último preview — rode o preview de novo antes de confirmar.</div>`;
      confirmBtn.disabled = true;
      return;
    }
    confirmBtn.disabled = true;
    const result = await submitJob();
    if (!result.ok || !result.jobId) {
      alertBox.innerHTML = `<div class="alert error">${result.errorMessage ?? "Falha ao iniciar o job."}</div>`;
      confirmBtn.disabled = false;
      return;
    }
    navigate(`/jobs/${getWizardState().feature}/${result.jobId}`);
  });

  // Se já existe um preview válido em memória (voltou da Etapa 3 sem mudar nada), reaproveita.
  if (!isPreviewStale() && state.previewItems) {
    renderPreviewItems(state.previewItems);
    confirmBtn.disabled = false;
  }
}
