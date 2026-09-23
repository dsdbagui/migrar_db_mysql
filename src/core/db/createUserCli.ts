import { UsernameTakenError, PasswordPolicyError, type AppUserWithHash } from "../appUsers.js";
import { validateNewPassword } from "../passwordPolicy.js";
import { PasswordInputAborted, EmptyPasswordInput } from "./promptPassword.js";

/**
 * Lógica do script create-user (_reversa_forward/006-redefinicao-de-senha, D-03), separada do
 * ponto de entrada (createUser.ts) para ser testável sem banco nem terminal reais.
 * Contrato completo em interfaces/cli-create-user.md.
 *
 * A senha NUNCA vem de argv (RN-01): no shell ela seria interpretada ($, #, !, &, espaço...),
 * truncada sem aviso, e ficaria visível no histórico e em `ps`.
 */

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_ABORTED = 130;

const USAGE = [
  "Uso:",
  "  npm run create-user -- <username>              cria um usuário",
  "  npm run create-user -- --reset <username>      redefine a senha de um usuário existente",
  "",
  "A senha é pedida no terminal (sem aparecer na tela) ou lida da primeira linha de stdin:",
  "  printf '%s\\n' \"$SENHA\" | npm run create-user -- <username>",
].join("\n");

export interface CreateUserCliDeps {
  isTty: boolean;
  readTty(prompt: string): Promise<string>;
  readStdin(): Promise<string>;
  createAppUser(username: string, password: string): Promise<{ id: string; username: string }>;
  findUserByUsername(username: string): Promise<AppUserWithHash | null>;
  changePassword(userId: string, newPassword: string): Promise<{ sessionsEnded: number }>;
  /** Mensagem para o operador, em texto (stderr). */
  print(message: string): void;
  log: {
    ok(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
}

type ParsedArgs = { mode: "create" | "reset"; username: string } | { error: string };

function parseArgs(argv: string[]): ParsedArgs {
  const reset = argv[0] === "--reset";
  const rest = reset ? argv.slice(1) : argv;
  if (rest.some((arg) => arg.startsWith("-"))) return { error: `opção desconhecida: ${rest.find((a) => a.startsWith("-"))}` };
  if (rest.length > 1) {
    return {
      error:
        "a senha não é mais aceita como argumento (o shell a interpreta e ela fica no histórico) — informe só o username",
    };
  }
  const username = rest[0]?.trim();
  if (!username) return { error: "username ausente" };
  return { mode: reset ? "reset" : "create", username };
}

async function readNewPassword(deps: CreateUserCliDeps): Promise<string | null> {
  if (!deps.isTty) {
    const password = await deps.readStdin();
    const policyError = validateNewPassword(password);
    if (policyError) {
      deps.print(`Erro: ${policyError}.`);
      return null;
    }
    return password;
  }
  const password = await deps.readTty("Senha: ");
  // Política antes da confirmação: não faz o operador digitar duas vezes uma senha que será recusada.
  const policyError = validateNewPassword(password);
  if (policyError) {
    deps.print(`Erro: ${policyError}.`);
    return null;
  }
  const confirmation = await deps.readTty("Confirme a senha: ");
  if (confirmation !== password) {
    deps.print("Erro: as senhas não conferem. Nada foi gravado.");
    return null;
  }
  return password;
}

export async function runCreateUser(argv: string[], deps: CreateUserCliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    deps.print(`Erro: ${parsed.error}.\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  const { mode, username } = parsed;

  // No reset, confere o usuário antes de pedir a senha — não adianta digitar para nada.
  const existing = mode === "reset" ? await deps.findUserByUsername(username) : null;
  if (mode === "reset" && !existing) {
    deps.print(`Erro: usuário "${username}" não encontrado. Nada foi alterado.`);
    return EXIT_FAILURE;
  }

  let password: string | null;
  try {
    password = await readNewPassword(deps);
  } catch (err) {
    if (err instanceof PasswordInputAborted) {
      deps.print("Interrompido. Nada foi gravado.");
      return EXIT_ABORTED;
    }
    if (err instanceof EmptyPasswordInput) {
      deps.print("Erro: nenhuma senha recebida em stdin. Nada foi gravado.");
      return EXIT_FAILURE;
    }
    throw err;
  }
  if (password === null) return EXIT_FAILURE;

  try {
    if (mode === "create") {
      const user = await deps.createAppUser(username, password);
      deps.log.ok("Usuário da aplicação criado", { username: user.username, id: user.id, canal: "cli" });
      return EXIT_OK;
    }
    const { sessionsEnded } = await deps.changePassword(existing!.id, password);
    deps.log.ok("Senha redefinida", { username, canal: "cli", sessoesEncerradas: sessionsEnded });
    return EXIT_OK;
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      deps.print(`Erro: username "${username}" já cadastrado. Para trocar a senha, use --reset.`);
      return EXIT_FAILURE;
    }
    if (err instanceof PasswordPolicyError) {
      deps.print(`Erro: ${err.message}.`);
      return EXIT_FAILURE;
    }
    deps.log.error(mode === "create" ? "Falha ao criar usuário" : "Falha ao redefinir senha", {
      username,
      error: String(err),
    });
    return EXIT_FAILURE;
  }
}
