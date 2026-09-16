import { getWizardState, updateWizardState } from "../../state/wizardState.js";
import { navigate } from "../../router.js";
import { renderWizardSteps } from "./steps.js";

/** Etapa 3 do wizard: opções específicas por feature (RF-04). */
export function renderStep3(container: HTMLElement): void {
  const state = getWizardState();
  if (!state.feature) {
    navigate("/wizard/step1");
    return;
  }

  container.innerHTML = `
    ${renderWizardSteps(3)}
    <h1>Etapa 3 — Opções</h1>
    <form id="step3-form">
      ${state.feature === "routines" ? routinesFields(state.routinesOptions) : tablesFields(state.tablesOptions)}
      <div class="actions">
        <button type="button" class="secondary" id="back-btn">Voltar</button>
        <button type="submit">Próximo</button>
      </div>
    </form>
  `;

  container.querySelector<HTMLButtonElement>("#back-btn")!.addEventListener("click", () => navigate("/wizard/step2"));

  const form = container.querySelector<HTMLFormElement>("#step3-form")!;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (state.feature === "routines") {
      updateWizardState({
        routinesOptions: {
          newDefiner: String(data.get("newDefiner") ?? ""),
          dropExisting: data.get("dropExisting") === "on",
        },
      });
    } else {
      updateWizardState({
        tablesOptions: {
          copyData: data.get("copyData") === "on",
          skipCreate: data.get("skipCreate") === "on",
          forceInnodb: data.get("forceInnodb") === "on",
          restoreRemovedFks: data.get("restoreRemovedFks") === "on",
          filters: parseKeyValueRows(form, "filter"),
          columnDefaults: parseColumnDefaultRows(form),
        },
      });
    }
    navigate("/wizard/step4");
  });
}

function routinesFields(opts: { newDefiner: string; dropExisting: boolean }): string {
  return `
    <div class="field">
      <label>Novo DEFINER (opcional — BR-MIGRAR-001)</label>
      <input type="text" name="newDefiner" value="${opts.newDefiner}" placeholder="\`usuario\`@\`%\`" />
    </div>
    <div class="checkbox-row">
      <input type="checkbox" name="dropExisting" ${opts.dropExisting ? "checked" : ""} />
      <label>Remover rotina existente no destino antes de recriar (DROP IF EXISTS)</label>
    </div>
  `;
}

function tablesFields(opts: {
  copyData: boolean;
  skipCreate: boolean;
  forceInnodb: boolean;
  restoreRemovedFks: boolean;
  filters: Record<string, string>;
  columnDefaults: Record<string, Record<string, string>>;
}): string {
  const filterRows = Object.entries(opts.filters);
  const defaultRows = Object.entries(opts.columnDefaults).flatMap(([table, cols]) =>
    Object.entries(cols).map(([col, val]) => [table, col, val] as const),
  );

  return `
    <div class="checkbox-row"><input type="checkbox" name="copyData" ${opts.copyData ? "checked" : ""} /><label>Copiar dados das tabelas</label></div>
    <div class="checkbox-row"><input type="checkbox" name="skipCreate" ${opts.skipCreate ? "checked" : ""} /><label>Pular DROP/CREATE (tabelas já existem no destino)</label></div>
    <div class="checkbox-row"><input type="checkbox" name="forceInnodb" ${opts.forceInnodb ? "checked" : ""} /><label>Forçar ENGINE=InnoDB</label></div>
    <div class="checkbox-row"><input type="checkbox" name="restoreRemovedFks" ${opts.restoreRemovedFks ? "checked" : ""} /><label>Tentar restaurar foreign keys removidas na recuperação (BR-MIGRAR-006)</label></div>

    <h2>Filtros WHERE por tabela (opcional)</h2>
    <div id="filter-rows">
      ${filterRows.map(([table, where], i) => keyValueRow("filter", i, table, where, "tabela", "WHERE")).join("")}
    </div>
    <button type="button" class="secondary" id="add-filter-row">+ Filtro</button>

    <h2>Valores padrão de coluna (column_defaults, opcional — BR-MIGRAR-008)</h2>
    <div id="default-rows">
      ${defaultRows.map(([table, col, val], i) => columnDefaultRow(i, table, col, val)).join("")}
    </div>
    <button type="button" class="secondary" id="add-default-row">+ Valor padrão</button>
  `;
}

function keyValueRow(prefix: string, i: number, key: string, value: string, keyLabel: string, valueLabel: string): string {
  return `<div class="checkbox-row" data-row="${prefix}">
    <input type="text" name="${prefix}-key-${i}" value="${key}" placeholder="${keyLabel}" />
    <input type="text" name="${prefix}-value-${i}" value="${value}" placeholder="${valueLabel}" />
  </div>`;
}

function columnDefaultRow(i: number, table: string, col: string, value: string): string {
  return `<div class="checkbox-row" data-row="default">
    <input type="text" name="default-table-${i}" value="${table}" placeholder="tabela" />
    <input type="text" name="default-col-${i}" value="${col}" placeholder="coluna" />
    <input type="text" name="default-value-${i}" value="${value}" placeholder='valor (ou "hoje")' />
  </div>`;
}

function parseKeyValueRows(form: HTMLFormElement, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  const rows = form.querySelectorAll<HTMLDivElement>(`[data-row="${prefix}"]`);
  rows.forEach((row) => {
    const inputs = row.querySelectorAll<HTMLInputElement>("input");
    const key = inputs[0]?.value.trim();
    const value = inputs[1]?.value.trim();
    if (key && value) result[key] = value;
  });
  return result;
}

function parseColumnDefaultRows(form: HTMLFormElement): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const rows = form.querySelectorAll<HTMLDivElement>('[data-row="default"]');
  rows.forEach((row) => {
    const inputs = row.querySelectorAll<HTMLInputElement>("input");
    const table = inputs[0]?.value.trim();
    const col = inputs[1]?.value.trim();
    const value = inputs[2]?.value.trim();
    if (table && col && value) {
      result[table] ??= {};
      result[table]![col] = value;
    }
  });
  return result;
}

// Delegação simples para os botões "+ Filtro"/"+ Valor padrão" — adicionados após o render
// inicial, então são ligados via addEventListener direto no elemento (já existe no DOM).
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.id === "add-filter-row") {
    const container = document.getElementById("filter-rows");
    if (container) container.insertAdjacentHTML("beforeend", keyValueRow("filter", Date.now(), "", "", "tabela", "WHERE"));
  }
  if (target.id === "add-default-row") {
    const container = document.getElementById("default-rows");
    if (container) container.insertAdjacentHTML("beforeend", columnDefaultRow(Date.now(), "", "", ""));
  }
});
