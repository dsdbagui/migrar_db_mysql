/**
 * Política mínima de senha dos usuários da aplicação
 * (_reversa_forward/006-redefinicao-de-senha, RN-05, D-05).
 *
 * Ponto único usado por toda gravação de senha — create-user, create-user --reset, POST /users e
 * POST /users/me/password — para que a regra e a mensagem sejam as mesmas em todos os canais.
 * NUNCA aplicar no login: senhas curtas gravadas antes desta política continuam válidas até a
 * próxima troca.
 *
 * 8 caracteres foi a decisão do operador em /reversa-clarify — abaixo dos 15 que a OWASP recomenda
 * sem MFA (registrado em investigation.md § 4). Sem regras de composição, por recomendação OWASP.
 */

export const MIN_PASSWORD_LENGTH = 8;

const POLICY_MESSAGE = `a senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;

/** Retorna a mensagem de erro da política, ou null se a senha é aceita. */
export function validateNewPassword(password: string): string | null {
  // Conta code points: "ação1234" tem 8 caracteres, um emoji conta como 1.
  return [...password].length >= MIN_PASSWORD_LENGTH ? null : POLICY_MESSAGE;
}
