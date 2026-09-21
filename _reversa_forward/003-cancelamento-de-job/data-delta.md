# Data Delta: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`

## Resumo

Nenhuma migração de schema necessária. `migration_jobs.status` já é `ENUM('pending','running','completed','failed','cancelled')` desde `src/core/db/migrations/001_init.sql` — o valor `'cancelled'` sempre existiu no tipo, só nunca era escrito por nenhuma rota. O delta desta feature é inteiramente comportamental (quem grava esse valor e quando), não estrutural.

## Campos novos

Nenhum.

## Campos removidos

Nenhum.

## Migrações necessárias

Nenhuma.

## Paridade com o legado

n/a — o legado (`migrate_routines.py`) era síncrono, de processo único, sem conceito de "job" persistido nem de cancelamento em execução (o operador só podia interromper com `Ctrl+C` no terminal, sem nenhum estado de "cancelado" registrado em lugar algum). `_reversa_sdd/migration/target_domain_model.md:24` já registrava o comando `cancelar` como parte do desenho do `AGG-MigrationJob` desde a etapa de migração original — este é o primeiro incremento a implementá-lo.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
