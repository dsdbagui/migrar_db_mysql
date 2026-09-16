const LABELS = ["Feature e conexões", "Itens", "Opções", "Preview e confirmação"];

/** Indicador visual das 4 etapas do wizard (BR-HUMANA-001) — usado por todas as telas de step. */
export function renderWizardSteps(active: 1 | 2 | 3 | 4): string {
  return `<div class="wizard-steps">${LABELS.map(
    (label, i) => `<span class="${i + 1 === active ? "active" : ""}">${i + 1}. ${label}</span>`,
  ).join("")}</div>`;
}
