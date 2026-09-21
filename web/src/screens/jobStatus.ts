import { api, type Feature, type JobStatusResponse } from "../api.js";
import { navigate } from "../router.js";
import { friendlyError } from "../lib/errorMessages.js";

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Tela de acompanhamento (RF-07): poll periódico até status terminal, com retentativa
 * automática em falha de rede (NFR Resiliência) — nunca descarta o `jobId` da URL.
 */
export function renderJobStatus(container: HTMLElement, params: { feature: string; id: string }): void {
  const feature = params.feature as Feature;
  const jobId = params.id;
  let stopped = false;
  let consecutiveNetworkFailures = 0;

  container.innerHTML = `
    <h1>Acompanhamento do job</h1>
    <p>Job <code>${jobId}</code> — feature <strong>${feature}</strong></p>
    <div id="job-alert"></div>
    <div id="job-status-box">Carregando…</div>
    <div id="job-items"></div>
  `;

  const alertBox = container.querySelector<HTMLDivElement>("#job-alert")!;
  const statusBox = container.querySelector<HTMLDivElement>("#job-status-box")!;
  const itemsBox = container.querySelector<HTMLDivElement>("#job-items")!;

  async function poll(): Promise<void> {
    if (stopped) return;
    if (!container.isConnected) {
      // Usuário navegou para outra tela da SPA — para de sondar em vez de atualizar um
      // container que não está mais na página.
      stopped = true;
      return;
    }
    const res = await api.getJobStatus(feature, jobId);

    if (res.status === 0) {
      consecutiveNetworkFailures += 1;
      alertBox.innerHTML = `<div class="alert warning">${friendlyError(0, "job")} (tentativa ${consecutiveNetworkFailures})</div>`;
      scheduleNext();
      return;
    }

    if (!res.ok || !res.data) {
      alertBox.innerHTML = `<div class="alert error">${friendlyError(res.status, "job")}</div>`;
      return; // erro definitivo (ex.: 404) — não adianta continuar tentando.
    }

    consecutiveNetworkFailures = 0;
    alertBox.innerHTML = "";
    renderStatus(res.data);

    if (TERMINAL_STATUSES.has(res.data.status)) {
      stopped = true;
      statusBox.insertAdjacentHTML(
        "beforeend",
        `<p><button id="see-result-btn">Ver resultado final</button></p>`,
      );
      container
        .querySelector<HTMLButtonElement>("#see-result-btn")!
        .addEventListener("click", () => navigate(`/jobs/${feature}/${jobId}/result`));
      return;
    }

    scheduleNext();
  }

  function scheduleNext(): void {
    if (stopped) return;
    window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
  }

  function renderStatus(data: JobStatusResponse): void {
    const errorHtml =
      data.status === "failed" && data.errorMessage
        ? `<div class="alert error">Falha: ${escapeHtml(data.errorMessage)}</div>`
        : "";
    // Cancelamento (_reversa_forward/003-cancelamento-de-job, RF-05): visível só enquanto
    // pending/running — some assim que o job atinge status terminal.
    const cancelHtml = TERMINAL_STATUSES.has(data.status)
      ? ""
      : `<p><button id="cancel-job-btn" class="secondary">Cancelar</button></p>`;
    statusBox.innerHTML = `<p>Status: <strong>${statusLabel(data.status)}</strong></p>${errorHtml}${cancelHtml}`;

    if (!TERMINAL_STATUSES.has(data.status)) {
      container.querySelector<HTMLButtonElement>("#cancel-job-btn")!.addEventListener("click", () => {
        void handleCancel();
      });
    }

    itemsBox.innerHTML = `
      <table>
        <thead><tr><th>Item</th><th>Tipo</th><th>Situação</th></tr></thead>
        <tbody>
          ${data.items
            .map(
              (item) => `<tr>
              <td>${item.name}</td>
              <td>${item.itemType}</td>
              <td>${item.applied ? "aplicado" : item.skipped ? "pulado" : item.applyError ? `erro: ${item.applyError}` : "processando…"}</td>
            </tr>`,
            )
            .join("") || '<tr><td colspan="3">Nenhum item processado ainda.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  async function handleCancel(): Promise<void> {
    if (!confirm("Tem certeza que deseja cancelar este job?")) return;

    const res = await api.cancelJob(jobId);
    if (!res.ok) {
      alertBox.innerHTML = `<div class="alert error">${friendlyError(res.status, "job")}</div>`;
      return;
    }
    // Não força o estado local aqui — deixa o próximo ciclo de poll (já agendado) trazer o
    // status "cancelled" persistido, mesma fonte de verdade que o resto da tela usa.
  }

  void poll();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusLabel(status: JobStatusResponse["status"]): string {
  const labels: Record<JobStatusResponse["status"], string> = {
    pending: "aguardando início",
    running: "em execução",
    completed: "concluído",
    failed: "falhou",
    cancelled: "cancelado",
  };
  return labels[status];
}
