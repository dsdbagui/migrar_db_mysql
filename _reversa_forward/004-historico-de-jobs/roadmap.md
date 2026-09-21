# Roadmap: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Requirements: `_reversa_forward/004-historico-de-jobs/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

A listagem é um handler novo dentro do mesmo arquivo transversal que já existe para lifecycle de job, `src/features/jobs/routes.ts` (`registerJobRoutes`, hoje só com `POST /jobs/:id/cancel` — feature `003-cancelamento-de-job`). Nenhuma rota nova precisa ser registrada em `src/app.ts` (`registerJobRoutes(app)` já está lá, linha 23). A consulta faz `LEFT JOIN` duplo em `connection_profiles` (origem e destino) para resolver os labels (RF-02), ordena por uma coluna nova `migration_jobs.created_at` (RN-01 — a coluna não existe hoje, é adicionada por uma migration idempotente no mesmo padrão de `002_add_job_error_message.sql`), e aceita filtros opcionais `?feature=`/`?status=` que reaproveitam o índice composto já existente `ix_migration_jobs_feature_status` (`001_init.sql:30`) — atendendo à NFR de Desempenho da `requirements.md` sem precisar de índice novo. No frontend, uma tela nova (`web/src/screens/jobHistory.ts`) consome um método novo do cliente HTTP (`api.listJobs()`), a rota `/jobs` é registrada em `web/src/main.ts`, e um link "Histórico" é adicionado à `<nav>` estática de `web/index.html`. `src/core/jobRunner.ts` não muda: `createJob`/`getJobStatus`/`runJob` continuam com a mesma assinatura, a coluna nova é preenchida pelo próprio `DEFAULT CURRENT_TIMESTAMP` do schema, sem precisar tocar no `INSERT` de `createJob` (`jobRunner.ts:79-90`).

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto (nenhum princípio formal registrado até `2026-09-21`) — seção n/a, sem conflito a relatar.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | `GET /jobs` vive em `src/features/jobs/routes.ts` (arquivo já existente, novo handler dentro de `registerJobRoutes`), não em arquivo próprio | Mesmo raciocínio já registrado no comentário de topo de `routes.ts:4-9` (feature `003`) e reafirmado pelo requirements (fonte "`src/features/jobs/routes.ts` ... já é o lugar natural para um `GET /jobs` transversal") — `migration_jobs` é genérico por `job.id`, independente de `feature` | Arquivo `src/features/jobs/listRoutes.ts` separado (rejeitado: fragmentaria um bounded context transversal que já tem exatamente um arquivo) | 🟢 |
| D-02 | Nova coluna `migration_jobs.created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`, via migration `003_add_migration_jobs_created_at.sql` | Decisão já travada em `requirements.md` RN-01/Esclarecimentos — mesmo padrão de `connection_profiles.created_at` (`001_init.sql:15`) e `job_reports.created_at` (`001_init.sql:72`); reaproveita o padrão idempotente `ADD COLUMN IF NOT EXISTS` já estabelecido por `002_add_job_error_message.sql` | Ordenar por `started_at` (rejeitado pelo próprio requirements: é `NULL` para jobs `pending`) | 🟢 |
| D-03 | Query usa `LEFT JOIN connection_profiles AS sp`/`AS tp` (não `INNER JOIN`) | `migration_jobs.source_profile_id` é `NULL` para a feature `collation_fix` (banco único, ver `target_data_model.md:51` e `target_domain_model.md:21`) — `INNER JOIN` esconderia esses jobs da listagem inteira, quebrando RF-01 ("lista os 50 jobs mais recentes") para essa feature | `INNER JOIN` (rejeitado: exclui jobs de `collation_fix` sem motivo declarado no requirements) | 🟢 |
| D-04 | Filtros opcionais `?feature=`/`?status=` na querystring de `GET /jobs`, aplicados como `WHERE` antes do `ORDER BY created_at DESC LIMIT 50` | A NFR de Desempenho da `requirements.md` ("deve usar o índice já existente ... quando filtros de feature/status forem aplicados") só faz sentido se o endpoint aceitar esses filtros — nenhuma RF pede UI para eles nesta entrega, então ficam como capacidade do contrato HTTP, sem elemento de UI correspondente | Não aceitar filtro nenhum (rejeitado: a NFR ficaria sem nenhum caminho de código a satisfazer) | 🟡 — a NFR não detalha os nomes exatos dos parâmetros, isso é inferência de nomenclatura consistente com o resto da API (`sourceProfileId`, `targetProfileId` já usam nomes de campo direto) |
| D-05 | `web/src/screens/jobHistory.ts` reaproveita `navigate()`/`api` do padrão já usado por `jobStatus.ts` (RF-03: link para `/jobs/:feature/:id`) | Consistência com o roteador hash mínimo já existente (`web/src/router.ts`), sem introduzir paginação client-side (fora de escopo, RN da NFR de Escopo) | Componente de tabela genérico reutilizável entre `jobHistory`/`jobStatus` (rejeitado: nenhuma das duas telas hoje compartilha esse tipo de componente, introduzir a abstração agora seria decomposição prematura) | 🟢 |
| D-06 | Link "Histórico" adicionado como terceiro item da `<nav>` de `web/index.html`, depois de "Nova migração" | RF-04 diz "ao lado de" os outros dois sem fixar ordem; manter a ordem cronológica do fluxo (perfis → nova migração → histórico) é a leitura mais direta | Inserir entre "Perfis de conexão" e "Nova migração" (rejeitado: sem sinal no requirements que justifique essa ordem específica) | 🟡 |

## 4. Premissas

Nenhuma — `requirements.md` não tem `[DÚVIDA]` pendente (seção 10: "Nenhuma lacuna pendente").

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| Core — Job Runner | `_reversa_sdd/migration/target_architecture.md` linha 49 | regra-alterada | A tabela que o Job Runner escreve (`migration_jobs`) ganha uma coluna nova (`created_at`); nenhuma função de `jobRunner.ts` muda de assinatura ou comportamento |
| features/jobs (rotas transversais de lifecycle de job) | `_reversa_sdd/migration/target_architecture.md` linha 49 (mesmo componente que já hospeda o contrato `POST /jobs/:id/cancel` da feature `003`) | contrato-novo | Novo handler `GET /jobs` no mesmo arquivo `src/features/jobs/routes.ts` |
| API / Wizard (frontend web) | `_reversa_sdd/migration/target_architecture.md` linha 46 | componente-novo (dentro do componente existente) | Tela nova `web/src/screens/jobHistory.ts` + rota `/jobs` + link de navegação — nenhuma tela existente muda de contrato |

## 6. Delta no modelo de dados

- Uma coluna nova em `migration_jobs` (`created_at`), sem novas tabelas. `target_data_model.md` (o "schema alvo" gerado em `2026-09-15`) não previa essa coluna — assim como `002_add_job_error_message.sql` já divergiu dele para `error_message`, este é mais um campo que só se tornou necessário ao construir uma feature concreta (mesmo padrão do adendo `002`).
- Detalhe completo em: `_reversa_forward/004-historico-de-jobs/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `GET /jobs` | HTTP | `_reversa_forward/004-historico-de-jobs/interfaces/get-jobs.md` |

## 8. Plano de migração

1. Criar `src/core/db/migrations/003_add_migration_jobs_created_at.sql` (`ADD COLUMN IF NOT EXISTS`, mesmo padrão idempotente de `002_add_job_error_message.sql`) e rodar `npm run migrate`.
2. Implementar a query (novo handler `GET /jobs` em `src/features/jobs/routes.ts`, ou uma função `listJobs()` em `src/features/jobs/service.ts` se o padrão de separar rota/serviço já usado em `routines`/`tables` for seguido) e os testes correspondentes em `tests/features/jobs/`.
3. Adicionar `api.listJobs()` em `web/src/api.ts`, seguindo o mesmo formato de `ApiResult<T>` já usado pelos outros métodos.
4. Criar `web/src/screens/jobHistory.ts`, registrar a rota `/jobs` em `web/src/main.ts`, adicionar o link em `web/index.html`.
5. Testar manualmente os dois cenários de `requirements.md` seção 7 (lista com 3 jobs, lista vazia) — ver `onboarding.md`.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Jobs já existentes no banco (criados antes da migration `003`) recebem todos o mesmo `created_at` (o momento em que a `ALTER TABLE` correu), não a data real de criação — a ordenação relativa *entre eles* fica arbitrária | baixo — só afeta o histórico pré-existente, jobs novos ordenam corretamente a partir do deploy | alto (é certo que acontece se já houver jobs em produção quando a migration rodar) | Aceitar como trade-off documentado — não há como recuperar retroativamente uma data que nunca foi persistida; registrar a limitação nesta seção em vez de tentar back-fill heurístico (ex.: usar `started_at` como aproximação só para linhas antigas introduziria uma regra de negócio extra não pedida pelo requirements) |
| `LEFT JOIN` duplo em `connection_profiles` a cada chamada de `GET /jobs` | baixo | baixo | `source_profile_id`/`target_profile_id` já são colunas de `FOREIGN KEY` (`001_init.sql:31-32`), o que no InnoDB já cria índice implícito — nenhum índice novo necessário; volume é baixo por design (`target_data_model.md` § Visão geral: "baixo volume, uso interno") |
| Esconder jobs de `collation_fix` da listagem por engano se um `INNER JOIN` fosse usado (ver D-03) | médio (feature ficaria com bug de escopo, sem sinal de erro) | baixo (mitigado pela própria decisão D-03) | Cobrir com teste automatizado explícito: job de `collation_fix` (sem `source_profile_id`) aparece em `GET /jobs` |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
