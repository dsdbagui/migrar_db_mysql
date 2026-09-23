import { closeAppDb } from "./appDb.js";
import { createAppUser, findUserByUsername, changePassword } from "../appUsers.js";
import { logger } from "../logger.js";
import { readPasswordFromTty, readPasswordFromStdin } from "./promptPassword.js";
import { runCreateUser } from "./createUserCli.js";

/**
 * Ponto de entrada do script de usuários da aplicação:
 *
 *   npm run create-user -- <username>             cria (primeiro usuário da instalação, D-09 da 005)
 *   npm run create-user -- --reset <username>     redefine a senha e encerra as sessões do usuário
 *
 * A senha é pedida no terminal sem eco (com confirmação) ou lida da primeira linha de stdin —
 * nunca de argv (_reversa_forward/006-redefinicao-de-senha). A lógica vive em createUserCli.ts.
 */
async function main(): Promise<void> {
  try {
    process.exitCode = await runCreateUser(process.argv.slice(2), {
      isTty: Boolean(process.stdin.isTTY),
      readTty: (prompt) => readPasswordFromTty(prompt),
      readStdin: () => readPasswordFromStdin(),
      createAppUser,
      findUserByUsername,
      changePassword,
      print: (message) => process.stderr.write(`${message}\n`),
      log: logger,
    });
  } catch (err) {
    logger.error("Falha inesperada no create-user", { error: String(err) });
    process.exitCode = 1;
  } finally {
    await closeAppDb();
  }
}

void main();
