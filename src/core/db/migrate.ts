import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAppDb, closeAppDb } from "./appDb.js";
import { logger } from "../logger.js";

const migrationsDir = path.dirname(fileURLToPath(import.meta.url)) + "/migrations";

async function migrate(): Promise<void> {
  const db = getAppDb();
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    logger.info(`Aplicando migration ${file}`);
    // multipleStatements não é habilitado por padrão no pool — cada statement roda separado.
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await db.query(statement);
    }
    logger.ok(`Migration ${file} aplicada`);
  }

  await closeAppDb();
}

migrate().catch((err) => {
  logger.error("Falha ao aplicar migrations", { error: String(err) });
  process.exitCode = 1;
});
