import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash de senha dos usuários da aplicação (_reversa_forward/005-perfil-conexao-por-usuario, D-03).
 *
 * scrypt com os parâmetros mínimos do OWASP para o fallback memory-hard (N=2^17, r=8, p=1), salt
 * aleatório de 16 bytes e chave derivada de 64 bytes. Irreversível por design (RF-02) — ao
 * contrário do cofre de credenciais MySQL (credentialVault.ts), que cifra de forma reversível.
 *
 * Formato do blob gravado em app_users.password_hash:
 *   log2(N) (1 byte) || r (1) || p (1) || salt (16) || chave derivada (64)
 * Os parâmetros viajam junto do hash para que um ajuste futuro de custo não invalide hashes
 * antigos: verifyPassword sempre usa os parâmetros com que o hash foi gerado.
 */

const LOG2_N = 17;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HEADER_BYTES = 3;

function derive(password: string, salt: Buffer, log2N: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** log2N;
  // Memória exigida pelo scrypt é ~128*N*r bytes (128 MiB com os parâmetros padrão) — acima do
  // limite default do Node (32 MiB), então maxmem precisa ser explícito.
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<Buffer> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, LOG2_N, R, P);
  return Buffer.concat([Buffer.from([LOG2_N, R, P]), salt, key]);
}

export async function verifyPassword(password: string, stored: Buffer): Promise<boolean> {
  if (stored.length !== HEADER_BYTES + SALT_BYTES + KEY_BYTES) return false;
  const [log2N, r, p] = [stored[0]!, stored[1]!, stored[2]!];
  const salt = stored.subarray(HEADER_BYTES, HEADER_BYTES + SALT_BYTES);
  const expected = stored.subarray(HEADER_BYTES + SALT_BYTES);
  const actual = await derive(password, salt, log2N, r, p);
  return timingSafeEqual(actual, expected);
}

/**
 * Hash de uma senha qualquer, usado pelo login quando o usuário não existe: verifyPassword roda
 * contra ele mesmo assim, para que "usuário inexistente" e "senha errada" levem o mesmo tempo
 * de resposta e não permitam enumerar contas pelo tempo (RF-03). Gerado sob demanda e memorizado.
 */
let dummyHash: Promise<Buffer> | undefined;
export function getDummyHash(): Promise<Buffer> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
