import { api } from "../api.js";
import { navigate } from "../router.js";
import { friendlyError } from "../lib/errorMessages.js";

/**
 * Tela de login (_reversa_forward/005-perfil-conexao-por-usuario, RF-03). A sessão fica num cookie
 * httpOnly definido pelo backend — esta tela nunca vê nem guarda o token. Qualquer 401 da API
 * (sessão ausente ou expirada após 2h) traz o operador de volta para cá (api.ts).
 */
export function renderLogin(container: HTMLElement): void {
  container.innerHTML = `
    <h1>Entrar</h1>
    <div id="login-alert"></div>
    <form id="login-form">
      <div class="field"><label>Usuário</label><input type="text" name="username" required autocomplete="username" /></div>
      <div class="field"><label>Senha</label><input type="password" name="password" required autocomplete="current-password" /></div>
      <div class="actions"><button type="submit">Entrar</button></div>
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("#login-form")!;
  const alertBox = container.querySelector<HTMLDivElement>("#login-alert")!;
  const submitBtn = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
  (form.elements.namedItem("username") as HTMLInputElement).focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    submitBtn.disabled = true;
    const res = await api.login({
      username: String(data.get("username") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    });
    submitBtn.disabled = false;

    if (res.ok) {
      navigate("/profiles");
      return;
    }
    (form.elements.namedItem("password") as HTMLInputElement).value = "";
    alertBox.innerHTML = `<div class="alert error">${friendlyError(res.status, "login")}</div>`;
  });
}
