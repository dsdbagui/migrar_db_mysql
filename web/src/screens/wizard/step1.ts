import { api, type ConnectionProfile, type Feature } from "../../api.js";
import { getWizardState, resetWizard, updateWizardState } from "../../state/wizardState.js";
import { navigate } from "../../router.js";
import { renderWizardSteps } from "./steps.js";

/** Etapa 1 do wizard: feature + perfis de origem/destino (RF-02). */
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
        <label>Perfil de destino (MySQL 8.x)</label>
        <select name="targetProfileId" required>${profileOptions(profiles)}</select>
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    updateWizardState({
      feature: String(data.get("feature")) as Feature,
      sourceProfileId: String(data.get("sourceProfileId")),
      targetProfileId: String(data.get("targetProfileId")),
    });
    navigate("/wizard/step2");
  });
}

function profileOptions(profiles: ConnectionProfile[]): string {
  return profiles.map((p) => `<option value="${p.id}">${p.label} (${p.host})</option>`).join("");
}
