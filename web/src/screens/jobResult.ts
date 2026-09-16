import { api, type Feature, type JobStatusResponse } from "../api.js";
import { friendlyError } from "../lib/errorMessages.js";

/**
 * Tela de resultado final (RF-08) + geração/download do relatório (RF-10), consumindo o
 * endpoint novo desta entrega (`interfaces/relatorio-de-job.md`).
 */
export async function renderJobResult(container: HTMLElement, params: { feature: string; id: string }): Promise<void> {
  const feature = params.feature as Feature;
  const jobId = params.id;

  container.innerHTML = `<h1>Resultado da migração</h1><p>Carregando…</p>`;

  const res = await api.getJobStatus(feature, jobId);
  if (!res.ok || !res.data) {
    container.innerHTML = `<h1>Resultado da migração</h1><div class="alert error">${friendlyError(res.status, "job")}</div>`;
    return;
  }

  renderResult(container, jobId, res.data);
}

function renderResult(container: HTMLElement, jobId: string, data: JobStatusResponse): void {
  const applied = data.items.filter((i) => i.applied);
  const failed = data.items.filter((i) => i.applyError != null);
  const skipped = data.items.filter((i) => i.skipped);

  container.innerHTML = `
    <h1>Resultado da migração</h1>
    <p>Job <code>${jobId}</code> — status final: <strong>${data.status}</strong></p>
    <p>${applied.length} aplicado(s), ${failed.length} com erro (falha isolada, BR-MIGRAR-003), ${skipped.length} pulado(s)</p>

    <table>
      <thead><tr><th>Item</th><th>Tipo</th><th>Linhas copiadas</th><th>Situação</th><th>Issues</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (item) => `<tr class="${item.applyError ? "row-error" : ""}">
            <td>${item.name}</td>
            <td>${item.itemType}</td>
            <td>${item.rowsCopied ?? "—"}</td>
            <td>${item.applied ? "aplicado" : item.skipped ? "pulado" : `erro: ${item.applyError}`}</td>
            <td>${item.issues.map((i) => `<span class="badge ${i.severity}">${i.code}</span>`).join(" ") || "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <h2>Relatório completo (BR-MIGRAR-016)</h2>
    <div id="report-alert"></div>
    <div class="actions">
      <button type="button" id="generate-report-btn">Gerar relatório</button>
    </div>
    <div id="report-links" hidden>
      <p>Baixar/visualizar:</p>
      <div class="actions">
        <a id="link-json" target="_blank" rel="noopener"><button type="button" class="secondary">JSON</button></a>
        <a id="link-html" target="_blank" rel="noopener"><button type="button" class="secondary">HTML</button></a>
        <a id="link-sql" target="_blank" rel="noopener"><button type="button" class="secondary">migration.sql</button></a>
        <a id="link-retry" target="_blank" rel="noopener"><button type="button" class="secondary">retry.sql</button></a>
      </div>
    </div>
  `;

  const alertBox = container.querySelector<HTMLDivElement>("#report-alert")!;
  const linksBox = container.querySelector<HTMLDivElement>("#report-links")!;

  container.querySelector<HTMLButtonElement>("#generate-report-btn")!.addEventListener("click", async () => {
    alertBox.innerHTML = "<p>Gerando relatório…</p>";
    const res = await api.generateReport(jobId);
    if (!res.ok) {
      alertBox.innerHTML = `<div class="alert error">${friendlyError(res.status, "report")}</div>`;
      return;
    }
    alertBox.innerHTML = `<div class="alert ok">Relatório gerado.</div>`;

    (container.querySelector<HTMLAnchorElement>("#link-json")!).href = api.reportUrl(jobId, "json");
    (container.querySelector<HTMLAnchorElement>("#link-html")!).href = api.reportUrl(jobId, "html");
    (container.querySelector<HTMLAnchorElement>("#link-sql")!).href = api.reportUrl(jobId, "sql");
    (container.querySelector<HTMLAnchorElement>("#link-retry")!).href = api.reportUrl(jobId, "retry");
    linksBox.hidden = false;

    if (failed.length === 0) {
      container.querySelector<HTMLAnchorElement>("#link-retry")!.title = "Sem itens com erro — pode retornar 404";
    }
  });
}
