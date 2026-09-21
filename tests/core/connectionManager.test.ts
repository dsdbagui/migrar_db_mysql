import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * spec-id: _reversa_forward/002-timeout-conexao-job/requirements.md (RF-01, RF-04, RF-05, RN-02).
 * resolveConnectTimeout é pura — sem I/O, sem necessidade de mockar o driver mysql2.
 * connect() precisa mockar mysql2/promise (limite do módulo, mesmo padrão de
 * tests/features/reports/report.routes.test.ts mockando appDb.js) — sem isso o teste
 * exigiria um MySQL real só para provar contagem de tentativas, o que não é o objetivo aqui.
 */

const createConnectionMock = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: { createConnection: (...args: unknown[]) => createConnectionMock(...args) },
}));

const { resolveConnectTimeout, DEFAULT_CONNECT_TIMEOUT_MS, MAX_CONNECT_ATTEMPTS, connect, ensureConnected } =
  await import("../../src/core/connectionManager.js");

const testParams = { host: "10.255.255.1", port: 3306, user: "root", password: "x", database: "db" };

beforeEach(() => {
  createConnectionMock.mockReset();
});

describe("resolveConnectTimeout", () => {
  it("usa o default quando o valor é ausente (undefined)", () => {
    expect(resolveConnectTimeout(undefined)).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
  });

  it("usa o default quando o valor é null", () => {
    expect(resolveConnectTimeout(null)).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
  });

  it("usa o default quando o valor é zero", () => {
    expect(resolveConnectTimeout(0)).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
  });

  it("usa o default quando o valor é negativo", () => {
    expect(resolveConnectTimeout(-5000)).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
  });

  it("usa o valor informado quando ele é positivo", () => {
    expect(resolveConnectTimeout(5000)).toBe(5000);
  });

  it("o default é 30000ms, decidido em /reversa-clarify (sessão 2026-09-21)", () => {
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBe(30000);
  });
});

describe("connect — retry sem backoff (RN-02, RF-04)", () => {
  it("faz até MAX_CONNECT_ATTEMPTS tentativas e propaga o último erro quando todas falham", async () => {
    expect(MAX_CONNECT_ATTEMPTS).toBe(3);
    createConnectionMock.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(connect("Origem", testParams)).rejects.toThrow("ETIMEDOUT");
    expect(createConnectionMock).toHaveBeenCalledTimes(3);
  });

  it("retorna a conexão e para de tentar assim que uma tentativa tem sucesso", async () => {
    const fakeConn = { ping: vi.fn(), end: vi.fn() };
    createConnectionMock
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce(fakeConn as never);

    const conn = await connect("Origem", testParams);

    expect(conn).toBe(fakeConn);
    expect(createConnectionMock).toHaveBeenCalledTimes(2);
  });

  it("passa connectTimeout de 30000ms para mysql.createConnection em cada tentativa (RF-01)", async () => {
    createConnectionMock.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(connect("Origem", testParams)).rejects.toThrow();

    for (const call of createConnectionMock.mock.calls) {
      expect(call[0]).toMatchObject({ connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS });
    }
  });
});

describe("ensureConnected — ping() com teto de tempo (RF-03, D-02)", () => {
  it("retorna a mesma conexão quando o ping responde normalmente", async () => {
    const conn = { ping: vi.fn().mockResolvedValue(undefined), end: vi.fn() };

    const result = await ensureConnected(conn as never, "Origem", testParams);

    expect(result).toBe(conn);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it("reconecta (via connect(), já com retry) quando o ping rejeita imediatamente", async () => {
    const deadConn = { ping: vi.fn().mockRejectedValue(new Error("conexão perdida")), end: vi.fn().mockResolvedValue(undefined) };
    const freshConn = { ping: vi.fn(), end: vi.fn() };
    createConnectionMock.mockResolvedValueOnce(freshConn as never);

    const result = await ensureConnected(deadConn as never, "Origem", testParams);

    expect(deadConn.end).toHaveBeenCalled();
    expect(result).toBe(freshConn);
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
  });

  it("reconecta quando o ping fica pendurado além do teto de 30s (mysql2 não tem timeout nativo em ping())", async () => {
    vi.useFakeTimers();
    try {
      const hangingPing = new Promise<void>(() => {
        /* nunca resolve nem rejeita — simula servidor que parou de responder sem fechar o socket */
      });
      const deadConn = { ping: vi.fn().mockReturnValue(hangingPing), end: vi.fn().mockResolvedValue(undefined) };
      const freshConn = { ping: vi.fn(), end: vi.fn() };
      createConnectionMock.mockResolvedValueOnce(freshConn as never);

      const resultPromise = ensureConnected(deadConn as never, "Origem", testParams);
      await vi.advanceTimersByTimeAsync(DEFAULT_CONNECT_TIMEOUT_MS);
      const result = await resultPromise;

      expect(deadConn.end).toHaveBeenCalled();
      expect(result).toBe(freshConn);
    } finally {
      vi.useRealTimers();
    }
  });
});
