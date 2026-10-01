import { buildApp } from "./app.js";
import { failOrphanedJobs } from "./core/jobRunner.js";
import { logger } from "./core/logger.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

// Jobs rodam dentro do processo: os que estavam pending/running quando o processo anterior morreu
// (ex. heap esgotado) nunca serão retomados — marca-os como falhos em vez de "em execução" eterno.
// Concluído ANTES do listen: senão um job criado logo após a subida poderia ser marcado como falho.
failOrphanedJobs()
  .then((count) => {
    if (count > 0) logger.warn("Jobs órfãos de execução anterior marcados como falhos", { count });
  })
  .catch((err) => logger.error("Falha ao marcar jobs órfãos", { error: String(err) }))
  .then(() => app.listen({ port, host: "0.0.0.0" }))
  .then(() => logger.ok(`Servidor ouvindo na porta ${port}`))
  .catch((err) => {
    logger.error("Falha ao iniciar servidor", { error: String(err) });
    process.exit(1);
  });
