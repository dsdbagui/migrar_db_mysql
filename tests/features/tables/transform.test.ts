import { describe, it, expect } from "vitest";
import {
  fixTableTypeKeyword,
  fixTableUtf8,
  fixTableMyisamOptions,
  fixTableEngineToInnodb,
  fixTableZerofill,
  fixTableIntDisplayWidth,
  transformTableDdl,
} from "../../../src/features/tables/transform.js";

/**
 * Espelha migracao-de-tabelas/tasks.md TT-01, TT-02, TT-08.
 */

describe("fixTableTypeKeyword", () => {
  it("substitui TYPE= por ENGINE= (sintaxe MySQL 4.x)", () => {
    const [ddl, issue] = fixTableTypeKeyword("CREATE TABLE t (id INT) TYPE=MyISAM");
    expect(ddl).toContain("ENGINE=MyISAM");
    expect(issue?.code).toBe("TYPE_TO_ENGINE");
    expect(issue?.severity).toBe("error");
  });
});

describe("fixTableUtf8", () => {
  it("converte utf8 para utf8mb4 sem tocar em utf8mb4 já existente", () => {
    const [ddl, issue] = fixTableUtf8("CHARSET=utf8 COLLATE=utf8_general_ci, outra COLLATE=utf8mb4_bin");
    expect(ddl).toContain("CHARSET=utf8mb4");
    expect(ddl).toContain("COLLATE=utf8mb4_general_ci");
    expect(ddl).toContain("COLLATE=utf8mb4_bin"); // não duplica mb4mb4
    expect(issue?.code).toBe("UTF8_CHARSET");
  });

  it("não dispara quando já é utf8mb4", () => {
    const [, issue] = fixTableUtf8("CHARSET=utf8mb4");
    expect(issue).toBeNull();
  });
});

describe("fixTableMyisamOptions", () => {
  it("remove PACK_KEYS, DELAY_KEY_WRITE e CHECKSUM", () => {
    const [ddl, issue] = fixTableMyisamOptions("ENGINE=MyISAM PACK_KEYS=1 DELAY_KEY_WRITE=1 CHECKSUM=1");
    expect(ddl).not.toMatch(/PACK_KEYS|DELAY_KEY_WRITE|CHECKSUM/);
    expect(issue?.code).toBe("MYISAM_OPTIONS");
  });
});

describe("fixTableEngineToInnodb", () => {
  it("converte MyISAM para InnoDB", () => {
    const [ddl, issue] = fixTableEngineToInnodb("ENGINE=MyISAM");
    expect(ddl).toBe("ENGINE=InnoDB");
    expect(issue?.code).toBe("ENGINE_TO_INNODB");
  });

  it("não altera quando já é InnoDB", () => {
    const [, issue] = fixTableEngineToInnodb("ENGINE=InnoDB");
    expect(issue).toBeNull();
  });
});

describe("fixTableZerofill", () => {
  it("avisa sobre ZEROFILL sem alterar o DDL", () => {
    const [ddl, issue] = fixTableZerofill("id INT ZEROFILL");
    expect(ddl).toBe("id INT ZEROFILL");
    expect(issue?.code).toBe("ZEROFILL");
  });
});

describe("fixTableIntDisplayWidth", () => {
  it("remove display width de INT/BIGINT mas preserva TINYINT(1)", () => {
    const [ddl, issue] = fixTableIntDisplayWidth("a INT(11), b BIGINT(20), c TINYINT(1)");
    expect(ddl).toContain("a INT,");
    expect(ddl).toContain("b BIGINT,");
    expect(ddl).toContain("c TINYINT(1)"); // preservado — convenção de boolean
    expect(issue?.code).toBe("INT_DISPLAY_WIDTH");
  });
});

describe("transformTableDdl", () => {
  it("aplica as 5 transformações estáticas, sem forçar engine por padrão", () => {
    const ddl = "CREATE TABLE t (id INT(11)) TYPE=MyISAM CHARSET=utf8";
    const { ddl: fixed, issues } = transformTableDdl(ddl, false);
    expect(fixed).toContain("ENGINE=MyISAM");
    expect(fixed).not.toContain("InnoDB");
    expect(issues.map((i) => i.code)).toEqual(["TYPE_TO_ENGINE", "UTF8_CHARSET", "INT_DISPLAY_WIDTH"]);
  });

  it("força InnoDB apenas quando force_innodb=true (opt-in)", () => {
    const ddl = "CREATE TABLE t (id INT) ENGINE=MyISAM";
    const { ddl: fixed, issues } = transformTableDdl(ddl, true);
    expect(fixed).toContain("ENGINE=InnoDB");
    expect(issues.map((i) => i.code)).toContain("ENGINE_TO_INNODB");
  });
});
