import { api } from "../api.js";
import { navigate } from "../router.js";
import { friendlyError } from "../lib/errorMessages.js";
import { resetWizard } from "../state/wizardState.js";

/**
 * Tela "Alterar senha" (_reversa_forward/006-redefinicao-de-senha, RF-11, D-08).
 *
 * Só troca a senha do próprio usuário logado (RN-04). A confirmação e o mínimo de 8 caracteres são
 * checados aqui só para poupar uma ida ao servidor — a regra que vale é a do backend
 * (passwordPolicy.ts). Com sucesso o backend encerra TODAS as sessões do usuário, inclusive esta,
 * então a tela descarta o wizard em andamento e volta ao login.
 */

const MIN_PASSWORD_LENGTH = 8;

export function renderChangePassword(container: HTMLElement): void {
  container.innerHTML = `
    <h1>Alterar senha</h1>
    <div class="alert warning">Ao alterar a senha, todas as suas sessões serão encerradas, inclusive em outros navegadores, e você precisará entrar de novo.</div>
    <div id="password-alert"></div>
    <form id="password-form">
      <div class="field"><label>Senha atual</label><input type="password" name="currentPassword" required autocomplete="current-password" /></div>
      <div class="field"><label>Senha nova (mínimo ${MIN_PASSWORD_LENGTH} caracteres)</label><input type="password" name="newPassword" required autocomplete="new-password" /></div>
      <div class="field"><label>Confirme a senha nova</label><input type="password" name="confirmPassword" required autocomplete="new-password" /></div>
      <div class="actions"><button type="submit">Alterar senha</button></div>
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("#password-form")!;
  const alertBox = container.querySelector<HTMLDivElement>("#password-alert")!;
  const submitBtn = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

  function showError(message: string): void {
    // textContent: a mensagem pode vir do servidor, nunca vira HTML.
    const box = document.createElement("div");
    box.className = "alert error";
    box.textContent = message;
    alertBox.replaceChildren(box);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    alertBox.replaceChildren();
    const currentPassword = field("currentPassword").value;
    const newPassword = field("newPassword").value;

    if ([...newPassword].length < MIN_PASSWORD_LENGTH) {
      showError(`A senha nova deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== field("confirmPassword").value) {
      showError("A confirmação não confere com a senha nova.");
      return;
    }

    submitBtn.disabled = true;
    const res = await api.changePassword({ currentPassword, newPassword });
    submitBtn.disabled = false;

    if (res.ok) {
      resetWizard();
      navigate("/login");
      return;
    }
    field("currentPassword").value = "";
    showError(friendlyError(res.status, "password-change", res.data?.error));
  });
}
