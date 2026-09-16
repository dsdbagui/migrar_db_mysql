# Data Delta: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`

## Resumo

Nenhuma migração de schema é necessária. Todas as tabelas usadas por esta feature já existem em `src/core/db/migrations/001_init.sql`: `connection_profiles`, `migration_jobs`, `job_items`, `job_item_fk_specs`, `job_reports`. O delta é inteiramente de **uso** — a tabela `job_reports` existe desde o incremento de backend anterior mas nenhuma rota a escreve ou lê; esta feature muda isso através do novo endpoint de `reports` (ver `interfaces/relatorio-de-job.md`).

## Campos novos

Nenhum.

## Campos removidos

Nenhum.

## Migrações necessárias

Nenhuma migração SQL nova. `job_reports` já tem a forma necessária:

```sql
job_reports (
    id, job_id, report_json, report_html, migration_sql, retry_sql, created_at
)
```

## Paridade com o schema legado (`report_data`)

O `report_data` do CLI (`_reversa_sdd/data-dictionary.md#report_data`, `migrate_routines.py:1362-1410`) era montado em memória a partir de `routine_results`/`table_results` (listas Python dentro de `main()`). O novo `report_json` persistido em `job_reports` deve preservar a mesma forma observável, remapeando a fonte para as tabelas já persistidas:

| Campo do `report_data` legado | Fonte no App DB (novo) | Observação |
|---|---|---|
| `timestamp` | `job_reports.created_at` | Já é `TIMESTAMP` nativo, não precisa ser string formatada manualmente |
| `source_db` / `destination_db` | `migration_jobs.source_profile_id` / `target_profile_id` → resolvidos via `connection_profiles.database_name` | Legado guardava o nome do banco direto; aqui é um join, já que a app tem perfis nomeados |
| `routines.total/applied/errors/skipped` | Agregado de `job_items WHERE job_id = ? AND item_type = 'routine'` | Contagem calculada na geração do relatório, não armazenada separadamente |
| `routines.items[]` | `job_items` (`item_type='routine'`): `name`, `applied`, `skipped`, `apply_error`, `issues_json` | `type` (PROCEDURE/FUNCTION) não é persistido hoje em `job_items` — ver nota abaixo |
| `tables.total/applied/errors/skipped/rows_copied` | Agregado de `job_items WHERE job_id = ? AND item_type = 'table'` | Idem rotinas |
| `tables.items[]` | `job_items` (`item_type='table'`): `name`, `applied`, `skipped`, `rows_copied`, `apply_error`, `copy_error`, `issues_json` | `engine`/`mode` do legado (ex.: "InnoDB", "schema-only" vs "com dados") não são persistidos hoje em `job_items` — ver nota abaixo |
| `issues[].code/severity/description` | `job_items.issues_json` | Já no formato `Issue` esperado (`src/core/issue.ts`), sem perda adicional (o legado já perdia `original`/`fixed` nesta serialização; a nova mantém a mesma perda, por paridade deliberada) |

### Nota — campos ausentes em `job_items` para paridade total

`job_items` (schema atual) não guarda `type` de rotina (PROCEDURE/FUNCTION) nem `engine`/`mode` de tabela (schema-only vs. com cópia de dados) — campos que o `report_data` legado exibia. Isso é uma lacuna de paridade a resolver no `/reversa-coding`: ou (a) adicionar essas colunas a `job_items` via nova migração, ou (b) derivar `type`/`engine`/`mode` a partir de `migration_jobs.params_json` (que já guarda `select`, `copyData`, `forceInnodb` etc.) no momento da geração do relatório, sem migração de schema. Recomendação: opção (b) primeiro (sem migração), reavaliar (a) apenas se a derivação se mostrar frágil.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-plan` | reversa |
