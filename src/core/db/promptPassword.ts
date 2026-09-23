/**
 * Leitura de senha para o script create-user sem passar pela linha de comando
 * (_reversa_forward/006-redefinicao-de-senha, D-01, D-02, RN-01).
 *
 * - Terminal: raw mode, sem eco, caractere a caractere. Nada é interpretado — a senha é exatamente
 *   o que foi digitado ou colado (RF-03).
 * - Sem terminal (pipe/arquivo): primeira linha de stdin, sem o \n / \r\n final e sem trim.
 *
 * Em raw mode, Ctrl+C não gera SIGINT: chega como o byte \u0003 e é tratado aqui (abort).
 */

export class PasswordInputAborted extends Error {
  constructor() {
    super("entrada de senha interrompida");
  }
}

export class EmptyPasswordInput extends Error {
  constructor() {
    super("nenhuma senha recebida em stdin");
  }
}

interface InputStream {
  isTTY?: boolean;
  setRawMode?(on: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: string) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
}

interface OutputStream {
  write(chunk: string): unknown;
}

const ENTER = new Set(["\r", "\n"]);
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const BACKSPACE = new Set(["\u007f", "\b"]);

export function readPasswordFromTty(
  prompt: string,
  io: { input?: InputStream; output?: OutputStream } = {},
): Promise<string> {
  const input = io.input ?? (process.stdin as unknown as InputStream);
  // stderr, para não misturar o prompt com os logs JSON do stdout.
  const output = io.output ?? process.stderr;

  return new Promise((resolve, reject) => {
    const chars: string[] = [];
    output.write(prompt);
    input.setRawMode?.(true);
    input.setEncoding("utf8");
    input.resume();

    const finish = (error?: Error): void => {
      input.removeListener("data", onData);
      input.setRawMode?.(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(chars.join(""));
    };

    function onData(chunk: string): void {
      // Itera por code point: uma colagem chega inteira num único evento.
      for (const ch of chunk) {
        if (ENTER.has(ch)) return finish();
        if (ch === CTRL_C) return finish(new PasswordInputAborted());
        if (ch === CTRL_D) return chars.length ? finish() : finish(new PasswordInputAborted());
        if (BACKSPACE.has(ch)) {
          chars.pop();
          continue;
        }
        if (ch < " ") continue; // demais caracteres de controle (Esc, Tab, setas...) são ignorados
        chars.push(ch);
      }
    }

    input.on("data", onData);
  });
}

export function readPasswordFromStdin(io: { input?: InputStream } = {}): Promise<string> {
  const input = io.input ?? (process.stdin as unknown as InputStream);
  return new Promise((resolve, reject) => {
    let data = "";
    input.setEncoding("utf8");
    const onData = (chunk: string): void => {
      data += chunk;
    };
    const onEnd = (): void => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      const firstLine = data.split(/\r?\n/)[0] ?? "";
      if (!firstLine) reject(new EmptyPasswordInput());
      else resolve(firstLine);
    };
    input.on("data", onData);
    input.on("end", onEnd);
    input.resume();
  });
}
