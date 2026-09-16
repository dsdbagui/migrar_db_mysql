import { describe, it, expect } from "vitest";
import { stripForeignKeys } from "../../../src/features/tables/fkRecovery.js";

/**
 * spec-id: PT-002 (parity_tests/02-recuperacao-de-foreign-key.feature) — parte pura
 * (stripForeignKeys não depende de conexão MySQL; find/dropReferencingFks e
 * resolvePendingForeignKeys exigem um banco de teste, fora do escopo dos testes unitários).
 */

describe("stripForeignKeys", () => {
  it("remove a cláusula FOREIGN KEY e retorna o fk_spec para restauração posterior", () => {
    const ddl =
      "CREATE TABLE `pedidos` (\n" +
      "  `id` INT NOT NULL,\n" +
      "  `cliente_id` INT NOT NULL,\n" +
      "  PRIMARY KEY (`id`),\n" +
      "  CONSTRAINT `fk_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE\n" +
      ") ENGINE=InnoDB";

    const { ddl: stripped, issues, fkSpecs } = stripForeignKeys(ddl);

    expect(stripped).not.toContain("FOREIGN KEY");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("FK_REMOVED");
    expect(fkSpecs).toHaveLength(1);
    expect(fkSpecs[0]).toMatchObject({
      fkName: "fk_cliente",
      childCols: ["cliente_id"],
      refTable: "clientes",
      refCols: ["id"],
      extra: "ON DELETE CASCADE",
    });
  });

  it("retorna o DDL inalterado quando não há FOREIGN KEY", () => {
    const ddl = "CREATE TABLE `clientes` (`id` INT NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB";
    const { ddl: stripped, issues, fkSpecs } = stripForeignKeys(ddl);
    expect(stripped).toBe(ddl);
    expect(issues).toHaveLength(0);
    expect(fkSpecs).toHaveLength(0);
  });
});
