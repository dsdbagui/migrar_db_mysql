import { api, type ConnectionProfile, type Feature } from "../../api.js";
import { getWizardState, resetWizard, updateWizardState } from "../../state/wizardState.js";
import { navigate } from "../../router.js";
import { renderWizardSteps } from "./steps.js";

/**
 * Etapa 1 do wizard: feature + perfis de origem/destino (RF-02) + banco de origem/destino
 * (_reversa_forward/005-perfil-conexao-por-usuario, D-05: o banco entra aqui, e não numa etapa
 * nova, porque a Etapa 2 já consulta a origem para listar os itens).
 */
export async function renderStep1(container: HTMLElement): Promise<void> {
  // "Nova migração" sempre reinicia o estado — evita misturar seleção de uma sessão
  // anterior com a atual quando o operador clica em "Nova migração" no topo.
  if (getWizardState().jobId !== null) {
    resetWizard();
  }

  const res = await api.listProfiles();
  const profiles: ConnectionProfile[] = res.ok && res.data ? res.data : [];

  container.innerHTML = `
    ${renderWizardSteps(1)}
    <h1>Etapa 1 — Feature e conexões</h1>
    ${profiles.length === 0 ? '<div class="alert warning">Nenhum perfil de conexão cadastrado. <a href="#/profiles">Crie um primeiro</a>.</div>' : ""}
    <form id="step1-form">
      <div class="field">
        <label>O que você quer migrar?</label>
        <select name="feature" required>
          <option value="routines">Rotinas (procedures/functions)</option>
          <option value="tables">Tabelas</option>
        </select>
      </div>
      <div class="field">
        <label>Perfil de origem (MySQL 5.x)</label>
        <select name="sourceProfileId" required>${profileOptions(profiles)}</select>
      </div>
      <div class="field">
        <label>Banco de origem</label>
        <input type="text" name="sourceDatabase" required placeholder="nome_do_banco" />
      </div>
      <div class="field">
        <label>Perfil de destino (MySQL 8.x)</label>
        <select name="targetProfileId" required>${profileOptions(profiles)}</select>
      </div>
      <div class="field">
        <label>Banco de destino</label>
        <input type="text" name="targetDatabase" required placeholder="nome_do_banco" />
      </div>
      <div class="actions">
        <button type="submit" ${profiles.length === 0 ? "disabled" : ""}>Próximo</button>
      </div>
    </form>
  `;

  const state = getWizardState();
  const form = container.querySelector<HTMLFormElement>("#step1-form")!;
  if (state.feature) (form.elements.namedItem("feature") as HTMLSelectElement).value = state.feature;
  if (state.sourceProfileId)
    (form.elements.namedItem("sourceProfileId") as HTMLSelectElement).value = state.sourceProfileId;
  if (state.targetProfileId)
    (form.elements.namedItem("targetProfileId") as HTMLSelectElement).value = state.targetProfileId;
  (form.elements.namedItem("sourceDatabase") as HTMLInputElement).value = state.sourceDatabase;
  (form.elements.namedItem("targetDatabase") as HTMLInputElement).value = state.targetDatabase;

  // BR-MIGRAR-014: o banco de destino sugere o mesmo nome do banco de origem — espelha a origem
  // enquanto o operador não editar o destino por conta própria.
  const sourceDbInput = form.elements.namedItem("sourceDatabase") as HTMLInputElement;
  const targetDbInput = form.elements.namedItem("targetDatabase") as HTMLInputElement;
  let targetEdited = targetDbInput.value !== "" && targetDbInput.value !== sourceDbInput.value;
  targetDbInput.addEventListener("input", () => {
    targetEdited = true;
  });
  sourceDbInput.addEventListener("input", () => {
    if (!targetEdited) targetDbInput.value = sourceDbInput.value;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    updateWizardState({
      feature: String(data.get("feature")) as Feature,
      sourceProfileId: String(data.get("sourceProfileId")),
      targetProfileId: String(data.get("targetProfileId")),
      sourceDatabase: String(data.get("sourceDatabase") ?? "").trim(),
      targetDatabase: String(data.get("targetDatabase") ?? "").trim(),
    });
    navigate("/wizard/step2");
  });
}

function profileOptions(profiles: ConnectionProfile[]): string {
  return profiles
    .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.label)} (${escapeHtml(p.host)})</option>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
