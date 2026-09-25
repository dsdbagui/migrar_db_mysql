import { describe, it, expect } from "vitest";
import {
  removeDefiner,
  fixSetOption,
  fixOldPasswordHash,
  cleanSqlMode,
  fixNoZeroDate,
  fixGroupConcatMaxlen,
  fixSqlSecurity,
  fixNoDefaultCharset,
  fixOnlyFullGroupBy,
  transformRoutine,
} from "../../../src/features/routines/transform.js";

/**
 * spec-id: PT-001 (parity_tests/01-migracao-rotina-com-transformacoes.feature)
 * Cobre BR-MIGRAR-001, BR-MIGRAR-002, BR-MIGRAR-003 e BR-MIGRAR-022 de target_business_rules.md,
 * espelhando migracao-de-rotinas/tasks.md TT-01 a TT-04.
 */

describe("removeDefiner", () => {
  it("remove o DEFINER quando new_definer não é informado", () => {
    const ddl = "CREATE DEFINER=`root`@`%` PROCEDURE sp_exemplo() BEGIN SELECT 1; END";
    const [newDdl, issue] = removeDefiner(ddl);
    expect(newDdl).not.toContain("DEFINER");
    expect(issue?.code).toBe("DEFINER_REMOVED");
  });

  it("substitui o DEFINER quando new_definer é informado", () => {
    const ddl = "CREATE DEFINER=`root`@`%` PROCEDURE sp_exemplo() BEGIN SELECT 1; END";
    const [newDdl, issue] = removeDefiner(ddl, "`novo`@`%`");
    expect(newDdl).toContain("DEFINER=`novo`@`%`");
    expect(issue?.code).toBe("DEFINER_REPLACED");
  });

  it("retorna null quando não há DEFINER", () => {
    const [newDdl, issue] = removeDefiner("CREATE PROCEDURE sp_exemplo() BEGIN SELECT 1; END");
    expect(issue).toBeNull();
    expect(newDdl).toBe("CREATE PROCEDURE sp_exemplo() BEGIN SELECT 1; END");
  });
});

describe("fixSetOption", () => {
  it("substitui SET OPTION por SET (error)", () => {
    const [ddl, issue] = fixSetOption("SET OPTION SQL_MODE=''");
    expect(ddl).toBe("SET SQL_MODE=''");
    expect(issue?.code).toBe("SET_OPTION");
    expect(issue?.severity).toBe("error");
  });
});

describe("fixOldPasswordHash", () => {
  it("avisa sobre OLD_PASSWORD sem alterar o DDL", () => {
    const [ddl, issue] = fixOldPasswordHash("SELECT OLD_PASSWORD('x')");
    expect(ddl).toBe("SELECT OLD_PASSWORD('x')");
    expect(issue?.code).toBe("OLD_PASSWORD");
    expect(issue?.fixed).toContain("revisão manual");
  });
});

describe("cleanSqlMode", () => {
  it("remove NO_AUTO_CREATE_USER do sql_mode", () => {
    const [ddl, issue] = cleanSqlMode("SQL_MODE='STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER'");
    expect(ddl).not.toContain("NO_AUTO_CREATE_USER");
    expect(issue?.code).toBe("SQL_MODE_NO_AUTO_CREATE_USER");
  });

  it("remove IGNORE_SPACE do sql_mode (BUG-20260925-GQ4N)", () => {
    const [ddl, issue] = cleanSqlMode("SQL_MODE='STRICT_TRANS_TABLES,IGNORE_SPACE'");
    expect(ddl).not.toContain("IGNORE_SPACE");
    expect(issue?.code).toBe("SQL_MODE_IGNORE_SPACE");
    expect(issue?.severity).toBe("info");
  });

  it("remove NO_AUTO_CREATE_USER e IGNORE_SPACE juntos, preservando os demais tokens", () => {
    const [ddl, issue] = cleanSqlMode(
      "SQL_MODE='STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,IGNORE_SPACE,NO_ZERO_DATE'",
    );
    expect(ddl).not.toContain("NO_AUTO_CREATE_USER");
    expect(ddl).not.toContain("IGNORE_SPACE");
    expect(ddl).toContain("STRICT_TRANS_TABLES");
    expect(ddl).toContain("NO_ZERO_DATE");
    // Quando os dois tokens aparecem juntos, o code do Issue prioriza o mais severo
    // (NO_AUTO_CREATE_USER é error, IGNORE_SPACE é info) — a descrição continua citando os dois.
    expect(issue?.code).toBe("SQL_MODE_NO_AUTO_CREATE_USER");
    expect(issue?.description).toContain("IGNORE_SPACE");
  });
});

describe("fixNoZeroDate", () => {
  it("detecta data zero sem alterar o DDL", () => {
    const [, issue] = fixNoZeroDate("DEFAULT '0000-00-00'");
    expect(issue?.code).toBe("ZERO_DATE");
  });
});

describe("fixGroupConcatMaxlen", () => {
  it("avisa sobre GROUP_CONCAT sem consultar o destino (BR-MIGRAR-022)", () => {
    const [ddl, issue] = fixGroupConcatMaxlen("SELECT GROUP_CONCAT(nome)");
    expect(ddl).toBe("SELECT GROUP_CONCAT(nome)");
    expect(issue?.code).toBe("GROUP_CONCAT");
  });
});

describe("fixSqlSecurity", () => {
  it("avisa sobre SQL SECURITY DEFINER", () => {
    const [, issue] = fixSqlSecurity("SQL SECURITY DEFINER");
    expect(issue?.code).toBe("SQL_SECURITY_DEFINER");
  });
});

describe("fixNoDefaultCharset", () => {
  it("remove CHARACTER SET inline", () => {
    const [ddl, issue] = fixNoDefaultCharset("BEGIN CHARACTER SET utf8 COLLATE utf8_general_ci; END");
    expect(ddl).not.toContain("CHARACTER SET");
    expect(issue?.code).toBe("CHARSET_INLINE");
  });
});

describe("fixOnlyFullGroupBy", () => {
  it("detecta SELECT * com GROUP BY", () => {
    const [, issue] = fixOnlyFullGroupBy("SELECT * FROM t GROUP BY col");
    expect(issue?.code).toBe("ONLY_FULL_GROUP_BY");
  });

  it("não dispara sem GROUP BY", () => {
    const [, issue] = fixOnlyFullGroupBy("SELECT * FROM t");
    expect(issue).toBeNull();
  });
});

describe("transformRoutine (pipeline completo)", () => {
  it("aplica DEFINER + SET OPTION numa única passada, na ordem esperada", () => {
    const ddl = "CREATE DEFINER=`old`@`%` PROCEDURE sp_exemplo() BEGIN SET OPTION SQL_MODE=''; END";
    const { ddl: fixed, issues } = transformRoutine(ddl);
    expect(fixed).not.toContain("DEFINER");
    expect(fixed).toContain("SET SQL_MODE");
    expect(issues.map((i) => i.code)).toEqual(["DEFINER_REMOVED", "SET_OPTION"]);
  });
});
