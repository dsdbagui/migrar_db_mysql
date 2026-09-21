# Actions: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Roadmap: `_reversa_forward/004-historico-de-jobs/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 9 |
| Paralelizáveis (`[//]`) | 7 |
| Maior cadeia de dependência | 6 (T002 → T003 → T004 → T005 → T006 → T007) |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Criar migration `ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by`, mesmo padrão idempotente de `002_add_job_error_message.sql` (D-02, `data-delta.md`) | - | `[//]` | `src/core/db/migrations/003_add_migration_jobs_created_at.sql` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T002 | Escrever testes de contrato (vitest) para `GET /jobs`, estendendo o mock de App DB já existente no arquivo: retorna `[]` (200) quando não há jobs; retorna jobs ordenados por `created_at DESC`; inclui `sourceProfileLabel`/`targetProfileLabel` resolvidos via `LEFT JOIN`; um job de `collation_fix` (sem `source_profile_id`) aparece na lista com `sourceProfileLabel: null` em vez de ser excluído; nunca retorna mais de 50 itens — mesmo padrão de `describe`/mock de `POST /jobs/:id/cancel` já no arquivo (D-01, D-02, D-03, `roadmap.md`) | - | `[//]` | `tests/features/jobs/routes.test.ts` | 🟢 | `[X]` |
| T003 | Escrever teste de contrato para os filtros opcionais `?feature=`/`?status=` de `GET /jobs`: aplicados, retornam só os jobs correspondentes; valor fora do enum aceito retorna `400` (D-04, `interfaces/get-jobs.md`) | T002 | - | `tests/features/jobs/routes.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T004 | Implementar `GET /jobs` em `registerJobRoutes` (`src/features/jobs/routes.ts`, mesmo arquivo de `fetchJobStatus`/`POST /jobs/:id/cancel`): função auxiliar que monta a query (`SELECT ... FROM migration_jobs j LEFT JOIN connection_profiles sp/tp ... ORDER BY j.created_at DESC LIMIT 50`), aplica `WHERE feature = ?`/`AND status = ?` quando presentes na querystring (validando contra o enum, `400` se inválido), e mapeia o resultado para o shape camelCase de `interfaces/get-jobs.md` (D-01, D-03, D-04) | T002, T003 | `[//]` | `src/features/jobs/routes.ts` | 🟡 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | Adicionar tipo `JobListItem` e método `api.listJobs(filters?: { feature?: string; status?: string })` ao cliente `web/src/api.ts` (`GET /jobs`, querystring opcional), seguindo o mesmo formato `ApiResult<T>` dos demais métodos | T004 | `[//]` | `web/src/api.ts` | 🟢 | `[X]` |
| T006 | Criar `web/src/screens/jobHistory.ts` com `renderJobHistory(container)`: busca `api.listJobs()`, renderiza tabela (feature, status, `startedAt`/`finishedAt`, `createdBy`, `sourceProfileLabel`/`targetProfileLabel`) com um link por linha chamando `navigate(\`/jobs/${feature}/${id}\`)`; exibe mensagem "nenhum job encontrado" (sem erro) quando a lista vier vazia — cobre os dois cenários Gherkin de `requirements.md` seção 7 (D-05) | T005 | `[//]` | `web/src/screens/jobHistory.ts` | 🟢 | `[X]` |
| T007 | Registrar a rota `/jobs` em `web/src/main.ts` (`addRoute("/jobs", () => renderJobHistory(app))`, com o import correspondente) | T006 | `[//]` | `web/src/main.ts` | 🟢 | `[X]` |
| T008 | Adicionar o link "Histórico" (`href="#/jobs"`) à `<nav>` estática de `web/index.html`, depois de "Nova migração" (D-06) | - | `[//]` | `web/index.html` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T009 | Tratar falha de rede/API em `renderJobHistory` com `friendlyError` (mesmo padrão de `jobStatus.ts:38-49`, `res.status === 0` vs `!res.ok`), exibindo um alerta em vez de deixar a tela em branco ou travada em "Carregando…" | T006 | - | `web/src/screens/jobHistory.ts` | 🟡 | `[X]` |

## Notas de execução

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-to-do` | reversa |
