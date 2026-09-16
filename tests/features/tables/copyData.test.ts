import { describe, it, expect } from "vitest";
import { resolveDefaultValue, sqlLiteral } from "../../../src/features/tables/copyData.js";

/** spec-id: PT-003 (parity_tests/03-column-defaults-substituindo-null.feature) — parte pura. */

describe("resolveDefaultValue", () => {
  it("resolve 'hoje'/'today' para a data atual em ISO", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(resolveDefaultValue("hoje")).toBe(today);
    expect(resolveDefaultValue("today")).toBe(today);
    expect(resolveDefaultValue("HOJE")).toBe(today);
  });

  it("usa qualquer outro valor como literal", () => {
    expect(resolveDefaultValue("pendente")).toBe("pendente");
  });
});

describe("sqlLiteral", () => {
  it("escapa aspas simples duplicando-as", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it("envolve o valor em aspas simples", () => {
    expect(sqlLiteral("pendente")).toBe("'pendente'");
  });
});
