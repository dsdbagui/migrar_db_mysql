# Legacy Impact: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data da execução: `2026-09-21`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`, `src/core/**`, `tests/core/**`, `src/features/jobs/**`, `tests/features/jobs/**`, `src/features/routines/**`, `src/features/tables/**` (todos os caminhos tocados por esta feature já estavam liberados, nenhuma adição necessária)

## Arquivos afetados

| Arquivo afetado | Componente | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `src/core/db/migrations/003_add_migration_jobs_created_at.sql` (novo) | App DB — `migration_jobs` (`_reversa_sdd/migration/target_data_model.md:48-58`) | delta-de-dados | MEDIUM | Coluna nova `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` — aditiva e idempotente (mesmo padrão de `002_add_job_error_message.sql`), mas MEDIUM porque toda linha já existente em `migration_jobs` recebe o timestamp do momento da `ALTER`, não a data real de criação (risco documentado em `roadmap.md § Riscos`) |
| `src/features/jobs/routes.ts` | Core — Job Runner / jobs (feature transversal) (`_reversa_sdd/migration/target_architecture.md:49`) | contrato-novo | LOW | `GET /jobs` — leitura pura, sem efeito colateral, sem autenticação própria (mesma postura já aceita em todo o app, `requirements.md` § NFR de Escopo) |
| `web/src/api.ts` | Cliente web | delta-de-contrato-externo (espelho local) | LOW | Novo método `listJobs(filters?)` + tipos `JobListItem`/`ListJobsFilters` |
| `web/src/screens/jobHistory.ts` (novo) | Cliente web — tela nova | componente-novo | LOW | Lista os jobs, com link para `jobStatus.ts` (RF-03); trata lista vazia e falha de rede/API |
| `web/src/main.ts` | Cliente web — roteador | regra-alterada | LOW | Rota `/jobs` registrada, apontando para `renderJobHistory` |
| `web/index.html` | Cliente web — navegação estática | regra-alterada | LOW | Link "Histórico" adicionado à `<nav>` |
| `tests/features/jobs/routes.test.ts` | Core — Job Runner / jobs (feature) | n/a (teste) | n/a | 9 testes novos cobrindo o contrato `GET /jobs` (vazio, ordenação, JOIN de labels, `collation_fix` sem excluir, limite de 50, filtros, `400` de validação) |

## Diff conceitual por componente

**App DB — `migration_jobs`.** Antes desta feature, a tabela não tinha nenhuma coluna de timestamp de criação — só `started_at`/`finished_at`, ambos `NULL` para um job que nunca chegou a rodar. Isso tornava "listar por recência" ambíguo para jobs `pending`. A migration `003` fecha essa lacuna de schema, no mesmo padrão já usado por `connection_profiles`/`job_reports` desde o `target_data_model.md` original (que, aliás, já não previa essa coluna para `migration_jobs` — um gap que só se tornou visível ao construir uma feature concreta, mesma dinâmica já registrada no adendo `002` para `error_message`).

**jobs (feature transversal).** `GET /jobs` foi implementado no mesmo arquivo que já hospeda `POST /jobs/:id/cancel` (feature `003`), reaproveitando o padrão de handler simples sem camada de serviço separada (`fetchJobStatus` já seguia essa forma). A query usa `LEFT JOIN` duplo em `connection_profiles` — decisão deliberada (não `INNER JOIN`) para não excluir jobs de `collation_fix`, que não têm `source_profile_id`. Filtros opcionais `?feature=`/`?status=` foram incluídos para dar uso concreto à NFR de Desempenho do `requirements.md`, sem exigir UI correspondente nesta entrega.

**Cliente web.** Aditivo em toda a extensão: uma tela nova, uma rota nova, um link novo, um método novo no cliente HTTP. Nenhuma tela existente (`jobStatus.ts`, `jobResult.ts`, `connectionProfiles.ts`) foi tocada.

## Preservadas

Comportamentos 🟢 confirmados que permanecem intactos:

- `GET /{feature}/jobs/:id` (`getJobStatus`) — contrato inalterado, `GET /jobs` é um contrato novo e paralelo, não uma substituição.
- `POST /jobs/:id/cancel` — nenhuma linha do handler existente foi tocada, só um handler novo foi adicionado ao mesmo arquivo.
- BR-MIGRAR-015 (`AGG-ConnectionProfile`: senha nunca retornada em texto claro) — `GET /jobs` só expõe `label` de `connection_profiles` via `JOIN`, nunca `password_enc` nem qualquer campo sensível.
- `ix_migration_jobs_feature_status` — reaproveitado como está, nenhum índice foi alterado ou recriado.
- Toda a lógica de `createJob`/`runJob`/`getProcessedNames`/`getPendingFkSpecs` em `jobRunner.ts` — nenhuma função mudou de assinatura ou comportamento; `created_at` é preenchido pelo próprio `DEFAULT` do schema, sem exigir mudança no `INSERT` de `createJob`.

## Modificadas

- **`migration_jobs` ganha `created_at`** — não há regra 🟢 de `domain.md` sendo alterada (o legado CLI nunca teve uma tabela `migration_jobs`; é infraestrutura nova da versão web, mesma observação já feita nos adendos `002`/`003` para `error_message`/`isCancelled`). Fica registrado aqui por ser uma mudança de schema, não por reverter uma regra confirmada do sistema original.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-coding` | reversa |
