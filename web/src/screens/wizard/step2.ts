import { api } from "../../api.js";
import { getWizardState, updateWizardState } from "../../state/wizardState.js";
import { navigate } from "../../router.js";
import { renderWizardSteps } from "./steps.js";
import { friendlyError } from "../../lib/errorMessages.js";

/**
 * Etapa 2 do wizard: seleção de itens por nome exato (RF-03, RN-01 — nunca por índice).
 *
 * Nota de implementação (T011): o backend não expõe uma rota dedicada para "listar nomes
 * disponíveis na origem" — a única forma de enumerar itens é chamar o próprio endpoint de
 * preview com `select: "all"`. Fazemos isso aqui só para popular a lista de escolha; o
 * preview "de verdade" (com as opções finais) roda de novo na Etapa 4 (RF-05).
 */
export async function renderStep2(container: HTMLElement): Promise<void> {
  const state = getWizardState();
  if (!state.feature || !state.sourceProfileId || !state.sourceDatabase) {
    navigate("/wizard/step1");
    return;
  }

  container.innerHTML = `
    ${renderWizardSteps(2)}
    <h1>Etapa 2 — Seleção de itens</h1>
    <p id="step2-loading">Carregando itens disponíveis na origem…</p>
  `;

  const discoverRes =
    state.feature === "routines"
      ? await api.previewRoutines(state.sourceProfileId, state.sourceDatabase, {
          select: "all",
          newDefiner: state.routinesOptions.newDefiner || undefined,
        })
      : await api.previewTables(state.sourceProfileId, state.sourceDatabase, {
          select: "all",
          forceInnodb: state.tablesOptions.forceInnodb,
        });

  if (!discoverRes.ok || !discoverRes.data) {
    container.querySelector("#step2-loading")!.outerHTML = `<div class="alert error">${friendlyError(discoverRes.status, "job")}</div>`;
    return;
  }

  const names = discoverRes.data.items.map((i) => i.name);
  const alreadySelected = state.select === "all" ? new Set(names) : new Set(state.select);
  const selectAllFlag = state.select === "all";

  container.innerHTML = `
    ${renderWizardSteps(2)}
    <h1>Etapa 2 — Seleção de itens</h1>
    ${names.length === 0 ? '<div class="alert warning">Nenhum item encontrado na origem para esta feature.</div>' : ""}
    <div class="checkbox-row">
      <input type="checkbox" id="select-all-flag" ${selectAllFlag ? "checked" : ""} />
      <label for="select-all-flag">Selecionar todos (inclui itens criados depois deste preview)</label>
    </div>
    <div id="item-list">
      ${names
        .map(
          (name, idx) => `
        <div class="checkbox-row">
          <input type="checkbox" class="item-checkbox" id="item-${idx}" value="${escapeAttr(name)}" ${alreadySelected.has(name) ? "checked" : ""} />
          <label for="item-${idx}">${escapeHtml(name)}</label>
        </div>`,
        )
        .join("")}
    </div>
    <div class="field">
      <label>Adicionar item por nome (não listado acima)</label>
      <div style="display:flex; gap:0.5rem;">
        <input type="text" id="manual-item-name" placeholder="nome_exato" />
        <button type="button" id="add-manual-item" class="secondary">Adicionar</button>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="secondary" id="back-btn">Voltar</button>
      <button type="submit" id="next-btn">Próximo</button>
    </div>
  `;

  const selectAllCheckbox = container.querySelector<HTMLInputElement>("#select-all-flag")!;
  const itemListEl = container.querySelector<HTMLDivElement>("#item-list")!;

  function toggleIndividualCheckboxes(): void {
    const disabled = selectAllCheckbox.checked;
    itemListEl.querySelectorAll<HTMLInputElement>(".item-checkbox").forEach((cb) => {
      cb.disabled = disabled;
    });
  }
  toggleIndividualCheckboxes();
  selectAllCheckbox.addEventListener("change", toggleIndividualCheckboxes);

  container.querySelector<HTMLButtonElement>("#add-manual-item")!.addEventListener("click", () => {
    const input = container.querySelector<HTMLInputElement>("#manual-item-name")!;
    const name = input.value.trim();
    if (!name) return;
    const idx = `manual-${Date.now()}`;
    const row = document.createElement("div");
    row.className = "checkbox-row";
    row.innerHTML = `<input type="checkbox" class="item-checkbox" id="${idx}" value="${escapeAttr(name)}" checked ${selectAllCheckbox.checked ? "disabled" : ""} /><label for="${idx}">${escapeHtml(name)} (adicionado manualmente)</label>`;
    itemListEl.appendChild(row);
    input.value = "";
  });

  container.querySelector<HTMLButtonElement>("#back-btn")!.addEventListener("click", () => navigate("/wizard/step1"));

  container.querySelector<HTMLButtonElement>("#next-btn")!.addEventListener("click", () => {
    if (selectAllCheckbox.checked) {
      updateWizardState({ select: "all" });
    } else {
      const checked = Array.from(itemListEl.querySelectorAll<HTMLInputElement>(".item-checkbox:checked")).map(
        (cb) => cb.value,
      );
      updateWizardState({ select: checked });
    }
    navigate("/wizard/step3");
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
