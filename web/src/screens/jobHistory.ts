import { api, type JobListItem } from "../api.js";
import { navigate } from "../router.js";
import { friendlyError } from "../lib/errorMessages.js";

/**
 * Tela de histórico (_reversa_forward/004-historico-de-jobs, RF-03): lista os jobs já
 * disparados sem depender do operador ter guardado o jobId (DEBT-004). Não substitui a
 * tela de acompanhamento/resultado — cada linha só linka para ela (RN-02).
 */
export function renderJobHistory(container: HTMLElement): void {
  container.innerHTML = `
    <h1>Histórico de jobs</h1>
    <div id="job-history-alert"></div>
    <div id="job-history-list">Carregando…</div>
  `;

  const alertBox = container.querySelector<HTMLDivElement>("#job-history-alert")!;
  const listBox = container.querySelector<HTMLDivElement>("#job-history-list")!;

  void load();

  async function load(): Promise<void> {
    const res = await api.listJobs();

    if (!res.ok || !res.data) {
      listBox.innerHTML = "";
      const kind = res.status === 0 ? "warning" : "error";
      alertBox.innerHTML = `<div class="alert ${kind}">${friendlyError(res.status, "job")}</div>`;
      return;
    }

    alertBox.innerHTML = "";
    render(res.data);
  }

  function render(items: JobListItem[]): void {
    if (items.length === 0) {
      listBox.innerHTML = "<p>Nenhum job encontrado.</p>";
      return;
    }

    listBox.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Destino</th>
            <th>Criado em</th>
            <th>Criado por</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => rowHtml(item)).join("")}
        </tbody>
      </table>
    `;

    for (const item of items) {
      container
        .querySelector<HTMLTableRowElement>(`tr[data-job-id="${item.id}"]`)!
        .addEventListener("click", () => navigate(`/jobs/${item.feature}/${item.id}`));
    }
  }

  function rowHtml(item: JobListItem): string {
    const errorHtml = item.status === "failed" && item.errorMessage ? ` — ${escapeHtml(item.errorMessage)}` : "";
    return `<tr data-job-id="${item.id}" class="clickable-row">
      <td>${item.feature}</td>
      <td>${statusLabel(item.status)}${errorHtml}</td>
      <td>${item.sourceProfileLabel ? escapeHtml(item.sourceProfileLabel) : "—"}</td>
      <td>${item.targetProfileLabel ? escapeHtml(item.targetProfileLabel) : "—"}</td>
      <td>${formatDate(item.createdAt)}</td>
      <td>${escapeHtml(item.createdBy)}</td>
    </tr>`;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function statusLabel(status: JobListItem["status"]): string {
  const labels: Record<JobListItem["status"], string> = {
    pending: "aguardando início",
    running: "em execução",
    completed: "concluído",
    failed: "falhou",
    cancelled: "cancelado",
  };
  return labels[status];
}
