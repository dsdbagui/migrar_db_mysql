/**
 * Mensagens amigáveis (pt-br) para os erros mais comuns retornados pela API — RF da
 * feature 001, "Polimento" do `actions.md` (T020). Não substitui o erro cru: sempre
 * usada junto de um log de console para depuração.
 */

export type ErrorContext =
  | "profile-delete"
  | "profile-create"
  | "report"
  | "job"
  | "login"
  | "password-change"
  | "user-create"
  | "generic";

export function friendlyError(status: number, context: ErrorContext, rawMessage?: string): string {
  if (status === 0) {
    return "Não foi possível falar com o servidor. Verifique sua conexão de rede e tente novamente.";
  }

  if (context === "report") {
    if (status === 404) return "Relatório ainda não gerado para este job — clique em \"Gerar relatório\" primeiro.";
    if (status === 409) return "O job ainda está em execução. Aguarde a conclusão para gerar o relatório.";
    if (status === 400) return "Formato de relatório inválido.";
  }

  if (context === "profile-delete") {
    if (status === 409) {
      return "Este perfil está em uso por uma migração já registrada e não pode ser excluído.";
    }
    if (status === 404) return "Perfil não encontrado — a lista pode estar desatualizada, atualize a página.";
  }

  if (context === "login") {
    // Mesma mensagem para usuário inexistente e senha errada (RF-03 da feature 005).
    if (status === 401) return "Usuário ou senha inválidos.";
    if (status === 400) return "Informe usuário e senha.";
  }

  // _reversa_forward/006-redefinicao-de-senha: 403 (não 401) é senha atual errada — a sessão continua.
  if (context === "password-change") {
    if (status === 403) return "Senha atual incorreta.";
    if (status === 400) return rawMessage ? capitalize(rawMessage) + "." : "Senha nova inválida.";
  }

  if (context === "user-create") {
    if (status === 409) return "Esse nome de usuário já está cadastrado.";
    if (status === 400) return rawMessage ? capitalize(rawMessage) + "." : "Dados do usuário inválidos.";
  }

  if (context === "profile-create") {
    if (status === 409) return "Você já tem um perfil com esse rótulo.";
    if (status === 400) return "Dados do perfil inválidos. Confira host, porta, usuário e senha.";
  }

  if (context === "job") {
    if (status === 404) return "Job não encontrado.";
  }

  if (status >= 500) {
    return "Erro interno no servidor. Tente novamente em instantes.";
  }

  return rawMessage ?? "Ocorreu um erro inesperado.";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
