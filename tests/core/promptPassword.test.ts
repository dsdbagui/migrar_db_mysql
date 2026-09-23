import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import {
  readPasswordFromTty,
  readPasswordFromStdin,
  PasswordInputAborted,
  EmptyPasswordInput,
} from "../../src/core/db/promptPassword.js";

/**
 * spec-id: _reversa_forward/006-redefinicao-de-senha/roadmap.md (D-01, D-02),
 * requirements.md (RF-01, RF-02, RF-03), investigation.md § 2 e § 3.
 * Streams simulados: o terminal real é exercitado pela T013 (pseudo-terminal).
 */

class FakeTty extends EventEmitter {
  isTTY = true;
  rawModeCalls: boolean[] = [];
  setRawMode(on: boolean): this {
    this.rawModeCalls.push(on);
    return this;
  }
  setEncoding(): this {
    return this;
  }
  resume(): this {
    return this;
  }
  pause(): this {
    return this;
  }
}

class FakeOutput {
  written = "";
  write(chunk: string): boolean {
    this.written += chunk;
    return true;
  }
}

function typeInto(tty: FakeTty, ...chunks: string[]): void {
  setImmediate(() => chunks.forEach((c) => tty.emit("data", c)));
}

describe("readPasswordFromTty", () => {
  it("lê até o Enter sem ecoar nada além do prompt e da quebra de linha", async () => {
    const tty = new FakeTty();
    const out = new FakeOutput();
    typeInto(tty, "p@ss w$rd!#&;`ç", "\r");
    const pw = await readPasswordFromTty("Senha: ", { input: tty, output: out });
    expect(pw).toBe("p@ss w$rd!#&;`ç");
    expect(out.written).toBe("Senha: \n");
    expect(tty.rawModeCalls).toEqual([true, false]);
  });

  it("Backspace apaga o último caractere (inclusive fora do BMP)", async () => {
    const tty = new FakeTty();
    typeInto(tty, "abc🔑", "\u007f", "\u007f", "d", "\n");
    expect(await readPasswordFromTty("Senha: ", { input: tty, output: new FakeOutput() })).toBe("abd");
  });

  it("colagem de vários caracteres num único evento, com Enter no meio, para no Enter", async () => {
    const tty = new FakeTty();
    typeInto(tty, "colado123\rlixo");
    expect(await readPasswordFromTty("Senha: ", { input: tty, output: new FakeOutput() })).toBe("colado123");
  });

  it("Ctrl+C aborta e desliga o raw mode", async () => {
    const tty = new FakeTty();
    typeInto(tty, "meia", "\u0003");
    await expect(readPasswordFromTty("Senha: ", { input: tty, output: new FakeOutput() })).rejects.toBeInstanceOf(
      PasswordInputAborted,
    );
    expect(tty.rawModeCalls).toEqual([true, false]);
  });

  it("ignora outros caracteres de controle", async () => {
    const tty = new FakeTty();
    typeInto(tty, "a\u001bb\tc", "\r");
    expect(await readPasswordFromTty("Senha: ", { input: tty, output: new FakeOutput() })).toBe("abc");
  });
});

describe("readPasswordFromStdin", () => {
  function pipeOf(...chunks: string[]): FakeTty {
    const stream = new FakeTty();
    stream.isTTY = false;
    setImmediate(() => {
      chunks.forEach((c) => stream.emit("data", c));
      stream.emit("end");
    });
    return stream;
  }

  it("usa só a primeira linha, sem o \\n final e sem trim", async () => {
    expect(await readPasswordFromStdin({ input: pipeOf("  p@ss w$rd!#& \nsegunda\n") })).toBe("  p@ss w$rd!#& ");
  });

  it("remove \\r\\n final", async () => {
    expect(await readPasswordFromStdin({ input: pipeOf("senha-longa\r\n") })).toBe("senha-longa");
  });

  it("aceita entrada sem quebra de linha final e em vários pedaços", async () => {
    expect(await readPasswordFromStdin({ input: pipeOf("sen", "ha-l", "onga") })).toBe("senha-longa");
  });

  it("stdin vazio ou primeira linha vazia é erro", async () => {
    await expect(readPasswordFromStdin({ input: pipeOf() })).rejects.toBeInstanceOf(EmptyPasswordInput);
    await expect(readPasswordFromStdin({ input: pipeOf("\nsenha\n") })).rejects.toBeInstanceOf(EmptyPasswordInput);
  });
});
