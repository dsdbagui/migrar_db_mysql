/**
 * Substitui info/ok/warn/error/header do legado (duplicados entre migrate_routines.py
 * e fix_collation_stamp.py — ADR-0005). Aqui existe uma única implementação, consumida
 * por todas as features (honra a decisão de topology_decision.md de eliminar a duplicação).
 *
 * Numa aplicação web não há terminal para o operador acompanhar ao vivo — por isso este
 * logger também é o ponto de extensão futuro para persistir eventos de job (ver core/jobRunner.ts).
 */

type Level = "info" | "ok" | "warn" | "error";

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  const line = {
    level,
    message,
    ...(context ?? {}),
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  ok: (message: string, context?: Record<string, unknown>) => emit("ok", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
