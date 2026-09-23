import { describe, it, expect } from "vitest";
import { validateNewPassword, MIN_PASSWORD_LENGTH } from "../../src/core/passwordPolicy.js";

/**
 * spec-id: _reversa_forward/006-redefinicao-de-senha/requirements.md (RN-05, RF-10), roadmap.md (D-05).
 */
describe("validateNewPassword", () => {
  it("mínimo é 8 caracteres", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("recusa 7 caracteres e aceita 8", () => {
    expect(validateNewPassword("1234567")).toMatch(/8 caracteres/);
    expect(validateNewPassword("12345678")).toBeNull();
  });

  it("recusa senha vazia", () => {
    expect(validateNewPassword("")).not.toBeNull();
  });

  it("conta caracteres, não bytes nem unidades UTF-16", () => {
    // "ação1234" tem 8 caracteres (10 bytes em UTF-8)
    expect(validateNewPassword("ação1234")).toBeNull();
    // emoji fora do BMP conta como 1 caractere (2 unidades UTF-16): 7 caracteres ao todo
    expect(validateNewPassword("🔑123456")).not.toBeNull();
    expect(validateNewPassword("🔑1234567")).toBeNull();
  });

  it("não exige classes de caractere nem remove espaços", () => {
    expect(validateNewPassword("aaaaaaaa")).toBeNull();
    expect(validateNewPassword("        ")).toBeNull();
  });

  it("devolve sempre a mesma mensagem", () => {
    expect(validateNewPassword("a")).toBe(validateNewPassword("abc"));
  });
});
