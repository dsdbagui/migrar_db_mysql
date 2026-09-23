import { api, type ConnectionProfile } from "../api.js";
import { friendlyError } from "../lib/errorMessages.js";

/**
 * Tela de gerenciamento de perfis de conexão (RF-01, RF-09) — listar, criar, excluir.
 * Consome `/connection-profiles*` (`src/core/profileRoutes.ts`).
 *
 * _reversa_forward/005-perfil-conexao-por-usuario (RF-07): o perfil não tem mais banco — o banco
 * de origem/destino é escolhido a cada migração, na Etapa 1 do wizard. A lista mostra só os
 * perfis do usuário logado (o backend filtra pelo dono da sessão).
 */
export async function renderConnectionProfiles(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1>Perfis de conexão</h1>
    <div id="profile-alert"></div>
    <table id="profile-table">
      <thead><tr><th>Rótulo</th><th>Host</th><th>Porta</th><th>Usuário</th><th></th></tr></thead>
      <tbody id="profile-rows"><tr><td colspan="5">Carregando…</td></tr></tbody>
    </table>

    <h2>Novo perfil</h2>
    <form id="profile-form">
      <div class="field"><label>Rótulo</label><input type="text" name="label" required /></div>
      <div class="field"><label>Host</label><input type="text" name="host" required /></div>
      <div class="field"><label>Porta</label><input type="number" name="port" value="3306" required /></div>
      <div class="field"><label>Usuário</label><input type="text" name="user" required /></div>
      <div class="field"><label>Senha</label><input type="password" name="password" required autocomplete="new-password" /></div>
      <div class="actions"><button type="submit">Salvar perfil</button></div>
    </form>
  `;

  const alertBox = container.querySelector<HTMLDivElement>("#profile-alert")!;
  const rowsEl = container.querySelector<HTMLTableSectionElement>("#profile-rows")!;
  const form = container.querySelector<HTMLFormElement>("#profile-form")!;

  function showAlert(kind: "error" | "ok", message: string): void {
    alertBox.innerHTML = `<div class="alert ${kind}">${message}</div>`;
  }

  async function loadProfiles(): Promise<void> {
    const res = await api.listProfiles();
    if (!res.ok || !res.data) {
      rowsEl.innerHTML = `<tr><td colspan="5">${friendlyError(res.status, "job")}</td></tr>`;
      return;
    }
    renderRows(res.data);
  }

  function renderRows(profiles: ConnectionProfile[]): void {
    if (profiles.length === 0) {
      rowsEl.innerHTML = `<tr><td colspan="5">Nenhum perfil cadastrado ainda.</td></tr>`;
      return;
    }
    rowsEl.innerHTML = profiles
      .map(
        (p) => `
      <tr data-id="${p.id}">
        <td>${escapeHtml(p.label)}</td>
        <td>${escapeHtml(p.host)}</td>
        <td>${p.port}</td>
        <td>${escapeHtml(p.user)}</td>
        <td><button type="button" class="secondary" data-action="delete" data-id="${p.id}">Excluir</button></td>
      </tr>`,
      )
      .join("");

    rowsEl.querySelectorAll<HTMLButtonElement>("button[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        if (!confirm("Excluir este perfil de conexão?")) return;
        const res = await api.deleteProfile(id);
        // RF-01 critério de aceite: exclusão de perfil referenciado por job existente
        // é recusada pelo backend (FOREIGN KEY ... ON DELETE RESTRICT) — tratamos aqui
        // sem quebrar a tela (T019).
        if (res.status === 204 || res.ok) {
          showAlert("ok", "Perfil excluído.");
          await loadProfiles();
        } else {
          showAlert("error", friendlyError(res.status, "profile-delete", res.data?.error));
        }
      });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const body = {
      label: String(formData.get("label") ?? ""),
      host: String(formData.get("host") ?? ""),
      port: Number(formData.get("port") ?? 3306),
      user: String(formData.get("user") ?? ""),
      password: String(formData.get("password") ?? ""),
    };
    const res = await api.createProfile(body);
    if (res.ok) {
      showAlert("ok", "Perfil criado.");
      form.reset();
      (form.elements.namedItem("port") as HTMLInputElement).value = "3306";
      await loadProfiles();
    } else {
      showAlert("error", friendlyError(res.status, "profile-create"));
    }
  });

  await loadProfiles();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
