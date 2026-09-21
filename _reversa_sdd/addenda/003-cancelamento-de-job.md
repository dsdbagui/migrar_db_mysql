# Adendo: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-21.

## Resumo da entrega

Implementa o comando `cancelar`, já previsto desde a etapa de migração no desenho do agregado `AGG-MigrationJob` (`_reversa_sdd/migration/target_domain_model.md:24`) mas nunca codificado. Adiciona um endpoint transversal `POST /jobs/:id/cancel`, cancelamento cooperativo nos loops de `routines`/`tables` (checagem entre itens, sem interromper query em voo), e corrige uma condição de corrida em `runJob` que a própria feature expõe: os `UPDATE`s terminais de sucesso/falha passam a exigir `status = 'running'`, para nunca sobrescrever um job já `cancelled`. 11/11 ações de `actions.md` concluídas, 63 testes automatizados verdes (10 novos).

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 49 (Core — Job Runner) | regra-alterada | `FeatureRunContext` ganha `isCancelled()`; `runJob` ganha a guarda `AND status = 'running'` nos dois `UPDATE`s terminais — correção de bug que a introdução do cancelamento expõe, detalhe completo em `_reversa_forward/003-cancelamento-de-job/legacy-impact.md` |
| `_reversa_sdd/migration/target_domain_model.md:24` | Aggregate `AGG-MigrationJob`, "Comandos aceitos" | regra-implementada | O comando `cancelar`, previsto no design desde 2026-09-15, passa de planejado para implementado — primeira feature a satisfazer essa parte do agregado |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (nova entrada: jobs) | contrato-novo | Novo endpoint transversal `POST /jobs/:id/cancel`, `src/features/jobs/routes.ts` — contrato detalhado em `_reversa_forward/003-cancelamento-de-job/interfaces/cancelamento-de-job.md` |
| Feature `routines`/`tables` (`src/features/routines/service.ts`, `src/features/tables/service.ts`) | — | regra-alterada | Loops de processamento checam `ctx.isCancelled()` entre itens; `tables` também pula a restauração de FKs pendentes quando cancelado, mantendo `SET FOREIGN_KEY_CHECKS=1` sempre |
| Telas do wizard (`web/src/screens/jobStatus.ts`), entregues por `001-frontend-wizard-migracao-web` | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md § Impacto por artefato` | regra-alterada | Botão "Cancelar" com confirmação nativa, visível enquanto o job está `pending`/`running` |

## Regras sob vigilância

- `W001`, `W002` — ver `_reversa_forward/003-cancelamento-de-job/regression-watch.md`

## Fontes

- `_reversa_forward/003-cancelamento-de-job/requirements.md`
- `_reversa_forward/003-cancelamento-de-job/roadmap.md`
- `_reversa_forward/003-cancelamento-de-job/legacy-impact.md`
- `_reversa_forward/003-cancelamento-de-job/regression-watch.md`
- `_reversa_forward/003-cancelamento-de-job/progress.jsonl`
