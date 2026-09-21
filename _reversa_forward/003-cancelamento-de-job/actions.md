# Actions: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Roadmap: `_reversa_forward/003-cancelamento-de-job/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 11 |
| Paralelizáveis (`[//]`) | 9 |
| Maior cadeia de dependência | 5 (T001 → T003 → T006 → T010 → T011) |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Criar o esqueleto do diretório `src/features/jobs/` com `routes.ts` exportando `registerJobRoutes` vazio (ainda não registrado em `app.ts`) | - | `[//]` | `src/features/jobs/routes.ts` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T002 | Escrever testes (vitest) para `runJob`: `isCancelled()` lê corretamente `migration_jobs.status`; o `UPDATE` terminal de sucesso (`completed`) NÃO sobrescreve um job já `cancelled`; idem para o caminho de falha (`failed`) (D-01, D-02) | - | `[//]` | `tests/core/jobRunner.test.ts` | 🟢 | `[X]` |
| T003 | Escrever testes de contrato (vitest) para `POST /jobs/:id/cancel`: `200` (pending/running → cancelled), `404` (job inexistente), `409` (qualquer status terminal, incluindo já `cancelled`) — mesmo padrão de `tests/features/reports/report.routes.test.ts` (App DB simulada em memória) (D-04) | T001 | `[//]` | `tests/features/jobs/routes.test.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T004 | Adicionar `isCancelled(): Promise<boolean>` a `FeatureRunContext` e implementar em `runJob` (consulta `SELECT status FROM migration_jobs WHERE id = ?`) (D-01) | T002 | `[//]` | `src/core/jobRunner.ts` | 🟢 | `[X]` |
| T005 | Adicionar `AND status = 'running'` aos dois `UPDATE`s terminais de `runJob` (`completed` e `failed`), para nunca sobrescrever um job já `cancelled` (D-02) | T004 | - | `src/core/jobRunner.ts` | 🟢 | `[X]` |
| T006 | Implementar `POST /jobs/:id/cancel` em `src/features/jobs/routes.ts`: `404` se não existe, `409` se status terminal, `200 { id, status: "cancelled" }` caso contrário (D-03, D-04) | T001, T003 | `[//]` | `src/features/jobs/routes.ts` | 🟢 | `[X]` |
| T007 | Adicionar `if (await ctx.isCancelled()) break;` no topo do loop de `runRoutinesJob` (`routines/service.ts:55`) | T004 | `[//]` | `src/features/routines/service.ts` | 🟢 | `[X]` |
| T008 | Adicionar `if (await ctx.isCancelled()) break;` no topo do loop de `runTablesJob` (`tables/service.ts:81`); pular a fase de restauração de FKs pendentes (`restoreRemovedFks`) quando cancelado, mantendo `SET FOREIGN_KEY_CHECKS=1` sempre (D-06) | T004 | `[//]` | `src/features/tables/service.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T009 | Registrar `registerJobRoutes(app)` em `src/app.ts`, ao lado de `registerRoutinesRoutes`/`registerTablesRoutes`/`registerReportsRoutes`/`registerProfileRoutes` | T006 | `[//]` | `src/app.ts` | 🟢 | `[X]` |
| T010 | Adicionar `cancelJob(jobId)` ao cliente `web/src/api.ts` (`POST /jobs/:id/cancel`, sem parâmetro `feature` — rota transversal) | T006 | `[//]` | `web/src/api.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T011 | Adicionar ação "Cancelar" na tela de acompanhamento (`jobStatus.ts`), visível enquanto `pending`/`running`, com confirmação via `confirm()` nativo antes de chamar `api.cancelJob` (D-05) | T010 | - | `web/src/screens/jobStatus.ts` | 🟡 | `[X]` |

## Notas de execução

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-to-do` | reversa |
