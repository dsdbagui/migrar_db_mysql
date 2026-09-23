import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/core/passwordHash.js";

/**
 * spec-id: _reversa_forward/005-perfil-conexao-por-usuario/roadmap.md (D-03), requirements.md (RF-02).
 * Usa o scrypt real — o custo (N=2^17) é justamente o que está sendo verificado, então não é
 * mockado. Cada hash leva algumas centenas de ms.
 */
describe("passwordHash", () => {
  it("gera hashes diferentes para a mesma senha (salt aleatório)", async () => {
    const a = await hashPassword("senha-de-teste");
    const b = await hashPassword("senha-de-teste");
    expect(a.equals(b)).toBe(false);
  });

  it("não contém a senha em texto claro", async () => {
    const hash = await hashPassword("senha-de-teste");
    expect(hash.toString("latin1")).not.toContain("senha-de-teste");
    expect(hash.length).toBeLessThanOrEqual(256); // cabe em app_users.password_hash VARBINARY(256)
  });

  it("verify aceita a senha correta", async () => {
    const hash = await hashPassword("senha-de-teste");
    expect(await verifyPassword("senha-de-teste", hash)).toBe(true);
  });

  it("verify rejeita a senha errada", async () => {
    const hash = await hashPassword("senha-de-teste");
    expect(await verifyPassword("outra-senha", hash)).toBe(false);
  });

  it("verify rejeita um blob malformado sem lançar erro", async () => {
    expect(await verifyPassword("qualquer", Buffer.from([1, 2, 3]))).toBe(false);
  });
});
