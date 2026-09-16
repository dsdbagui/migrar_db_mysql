import { buildApp } from "./app.js";
import { logger } from "./core/logger.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => logger.ok(`Servidor ouvindo na porta ${port}`))
  .catch((err) => {
    logger.error("Falha ao iniciar servidor", { error: String(err) });
    process.exit(1);
  });
