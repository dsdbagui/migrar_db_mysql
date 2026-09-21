# Adendo: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-21.

## Resumo da entrega

Antes desta feature, o `jobId` só existia na navegação em memória do wizard web — se a aba fechava, dava refresh, ou o operador esquecia de copiar o id antes de sair da tela de resultado, não havia como recuperar aquele job depois, mesmo `migration_jobs`/`job_items` persistindo tudo no App DB (gap original relatado em `_reversa_forward/001-frontend-wizard-migracao-web/tech-debt-log.md#DEBT-004`). A entrega adiciona um endpoint transversal `GET /jobs` (50 jobs mais recentes por `created_at DESC`, coluna nova, com labels de origem/destino já resolvidos via `JOIN` com `connection_profiles`) e uma tela de histórico no wizard (`web/src/screens/jobHistory.ts`), com link para o acompanhamento/resultado de cada job. 9/9 ações de `actions.md` concluídas, 70 testes automatizados verdes (9 novos).

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 49 (Core — Job Runner) | delta-de-dados | Nova coluna `migration_jobs.created_at` (`TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`), necessária porque a tabela não tinha nenhum campo confiável para ordenar "mais recente primeiro" (`started_at` é `NULL` para jobs `pending`) — detalhe completo em `_reversa_forward/004-historico-de-jobs/data-delta.md` |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 49 (mesmo componente que já hospeda `POST /jobs/:id/cancel`, adendo `003`) | contrato-novo | Novo endpoint transversal `GET /jobs`, `src/features/jobs/routes.ts` (mesmo arquivo) — lista com filtros opcionais `?feature=`/`?status=`, `LEFT JOIN` duplo em `connection_profiles` para resolver labels sem excluir jobs de `collation_fix`. Contrato detalhado em `_reversa_forward/004-historico-de-jobs/interfaces/get-jobs.md` |
| Telas do wizard, entregues por `001-frontend-wizard-migracao-web` | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md § Impacto por artefato` | componente-novo | Tela nova `web/src/screens/jobHistory.ts` (rota `/jobs`), com link "Histórico" na `<nav>` estática (`web/index.html`) — não substitui nem duplica `jobStatus.ts`/`jobResult.ts`, cada linha da listagem apenas linka para eles |

## Regras sob vigilância

- `W001`, `W002`, `W003` — ver `_reversa_forward/004-historico-de-jobs/regression-watch.md`

## Fontes

- `_reversa_forward/004-historico-de-jobs/requirements.md`
- `_reversa_forward/004-historico-de-jobs/roadmap.md`
- `_reversa_forward/004-historico-de-jobs/legacy-impact.md`
- `_reversa_forward/004-historico-de-jobs/regression-watch.md`
- `_reversa_forward/004-historico-de-jobs/progress.jsonl`
