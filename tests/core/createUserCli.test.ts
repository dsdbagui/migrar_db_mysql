import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCreateUser, type CreateUserCliDeps } from "../../src/core/db/createUserCli.js";
import { UsernameTakenError } from "../../src/core/appUsers.js";
import { PasswordInputAborted, EmptyPasswordInput } from "../../src/core/db/promptPassword.js";

/**
 * spec-id: _reversa_forward/006-redefinicao-de-senha/interfaces/cli-create-user.md,
 * requirements.md (RN-01, RF-01..RF-06), roadmap.md (D-03).
 * Lógica da CLI com dependências injetadas — sem banco nem terminal reais (a T013 cobre o
 * comando de ponta a ponta sob pseudo-terminal).
 */

vi.mock("../../src/core/db/appDb.js", () => ({ getAppDb: () => ({}) }));

let deps: CreateUserCliDeps & {
  printed: string[];
  ttyAnswers: Array<string | Error>;
  stdinAnswer: string | Error;
};

function makeDeps(isTty: boolean): typeof deps {
  const d = {
    isTty,
    printed: [] as string[],
    ttyAnswers: [] as Array<string | Error>,
    stdinAnswer: "" as string | Error,
    readTty: vi.fn(async (_prompt: string) => {
      const next = d.ttyAnswers.shift();
      if (next instanceof Error) throw next;
      return next ?? "";
    }),
    readStdin: vi.fn(async () => {
      if (d.stdinAnswer instanceof Error) throw d.stdinAnswer;
      return d.stdinAnswer;
    }),
    createAppUser: vi.fn(async (username: string) => ({ id: `id-${username}`, username })),
    findUserByUsername: vi.fn(async (username: string) =>
      username === "ana" ? { id: "id-ana", username: "ana", passwordHash: Buffer.alloc(0) } : null,
    ),
    changePassword: vi.fn(async () => ({ sessionsEnded: 2 })),
    print: (msg: string) => {
      d.printed.push(msg);
    },
    log: { ok: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
  return d;
}

beforeEach(() => {
  deps = makeDeps(true);
});

describe("uso (código 2)", () => {
  it.each([
    [[]],
    [["ana", "minhasenha"]],
    [["--reset"]],
    [["--reset", "ana", "senha"]],
    [["--apagar", "ana"]],
    [["ana", "--reset"]],
    [["   "]],
  ])("argv %j é erro de uso, sem ler senha nem gravar", async (argv) => {
    expect(await runCreateUser(argv, deps)).toBe(2);
    expect(deps.readTty).not.toHaveBeenCalled();
    expect(deps.createAppUser).not.toHaveBeenCalled();
    expect(deps.changePassword).not.toHaveBeenCalled();
    expect(deps.printed.join("\n")).toMatch(/create-user -- --reset <username>/);
  });

  it("senha como argumento explica que não é mais aceita", async () => {
    await runCreateUser(["ana", "minhasenha"], deps);
    expect(deps.printed.join("\n")).toMatch(/não é mais aceita como argumento/);
  });
});

describe("criação", () => {
  it("terminal: pede senha e confirmação e cria (0)", async () => {
    deps.ttyAnswers = ["p@ss w$rd!#&", "p@ss w$rd!#&"];
    expect(await runCreateUser(["carla"], deps)).toBe(0);
    expect(deps.readTty.mock.calls.map((c) => c[0])).toEqual(["Senha: ", "Confirme a senha: "]);
    expect(deps.createAppUser).toHaveBeenCalledWith("carla", "p@ss w$rd!#&");
  });

  it("terminal: confirmação diferente não grava (1)", async () => {
    deps.ttyAnswers = ["senha-longa-1", "senha-longa-2"];
    expect(await runCreateUser(["carla"], deps)).toBe(1);
    expect(deps.createAppUser).not.toHaveBeenCalled();
  });

  it("terminal: senha curta é recusada antes da confirmação (1)", async () => {
    deps.ttyAnswers = ["curta"];
    expect(await runCreateUser(["carla"], deps)).toBe(1);
    expect(deps.readTty).toHaveBeenCalledTimes(1);
    expect(deps.createAppUser).not.toHaveBeenCalled();
    expect(deps.printed.join("\n")).toMatch(/8 caracteres/);
  });

  it("stdin: usa a senha lida, sem confirmação (0)", async () => {
    deps = makeDeps(false);
    deps.stdinAnswer = "outra s3nh@ $ecreta";
    expect(await runCreateUser(["carla"], deps)).toBe(0);
    expect(deps.readTty).not.toHaveBeenCalled();
    expect(deps.createAppUser).toHaveBeenCalledWith("carla", "outra s3nh@ $ecreta");
  });

  it("stdin vazio é erro (1)", async () => {
    deps = makeDeps(false);
    deps.stdinAnswer = new EmptyPasswordInput();
    expect(await runCreateUser(["carla"], deps)).toBe(1);
    expect(deps.createAppUser).not.toHaveBeenCalled();
  });

  it("Ctrl+C durante a digitação: 130, nada gravado", async () => {
    deps.ttyAnswers = [new PasswordInputAborted()];
    expect(await runCreateUser(["carla"], deps)).toBe(130);
    expect(deps.createAppUser).not.toHaveBeenCalled();
  });

  it("username já cadastrado (1)", async () => {
    deps.ttyAnswers = ["senha-longa", "senha-longa"];
    deps.createAppUser.mockRejectedValueOnce(new UsernameTakenError("carla"));
    expect(await runCreateUser(["carla"], deps)).toBe(1);
    expect(deps.printed.join("\n")).toMatch(/já cadastrado/);
  });
});

describe("--reset", () => {
  it("redefine a senha de um usuário existente e informa as sessões encerradas (0)", async () => {
    deps.ttyAnswers = ["nova-senha-1", "nova-senha-1"];
    expect(await runCreateUser(["--reset", "ana"], deps)).toBe(0);
    expect(deps.changePassword).toHaveBeenCalledWith("id-ana", "nova-senha-1");
    expect(deps.createAppUser).not.toHaveBeenCalled();
    expect(deps.log.ok).toHaveBeenCalledWith(
      "Senha redefinida",
      expect.objectContaining({ username: "ana", canal: "cli", sessoesEncerradas: 2 }),
    );
  });

  it("usuário inexistente: erro sem pedir senha e sem criar (1)", async () => {
    expect(await runCreateUser(["--reset", "fantasma"], deps)).toBe(1);
    expect(deps.readTty).not.toHaveBeenCalled();
    expect(deps.changePassword).not.toHaveBeenCalled();
    expect(deps.createAppUser).not.toHaveBeenCalled();
  });

  it("nenhum log contém a senha", async () => {
    deps.ttyAnswers = ["segredo-unico-xyz", "segredo-unico-xyz"];
    await runCreateUser(["--reset", "ana"], deps);
    const everything = JSON.stringify([deps.printed, deps.log.ok.mock.calls, deps.log.warn.mock.calls]);
    expect(everything).not.toContain("segredo-unico-xyz");
  });
});
