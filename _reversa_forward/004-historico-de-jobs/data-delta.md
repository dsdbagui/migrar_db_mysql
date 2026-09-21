# Data Delta: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Modelo de referência: `_reversa_sdd/migration/target_data_model.md` (schema "alvo" gerado em `2026-09-15`, já parcialmente superado por `002_add_job_error_message.sql` antes desta feature)

## Migration nova

`src/core/db/migrations/003_add_migration_jobs_created_at.sql` (nome consistente com `002_add_job_error_message.sql`; o runner `src/core/db/migrate.ts` reaplica todos os `.sql` a cada execução, sem tabela de controle — mesma observação já registrada no comentário de topo de `002_add_job_error_message.sql:4-5`):

```sql
-- Adiciona a coluna que falta para ordenar "mais recente primeiro" na listagem de jobs
-- (_reversa_forward/004-historico-de-jobs). Antes desta migration, migration_jobs não tinha
-- nenhuma coluna de timestamp de criação, diferente de connection_profiles e job_reports
-- (001_init.sql:15 e :72), que já seguem esse padrão.
ALTER TABLE migration_jobs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by;
```

## Campo novo

| Tabela | Coluna | Tipo | Default | Backfill |
|---|---|---|---|---|
| `migration_jobs` | `created_at` | `TIMESTAMP NOT NULL` | `CURRENT_TIMESTAMP` | Automático pelo próprio `ALTER TABLE`: o MySQL preenche as linhas já existentes com o timestamp do momento em que a `ALTER` roda (não com a data real de criação de cada job, que nunca foi persistida — ver `roadmap.md` § Riscos) |

## Campos removidos

Nenhum.

## Tabelas novas

Nenhuma — `job_items`, `job_item_fk_specs`, `job_reports`, `connection_profiles` não são tocados.

## Índices

Nenhum índice novo. `GET /jobs` reaproveita:
- `ix_migration_jobs_feature_status` (`001_init.sql:30`) quando os filtros opcionais `?feature=`/`?status=` são usados (D-04 do `roadmap.md`).
- Os índices implícitos de `fk_migration_jobs_source`/`fk_migration_jobs_target` (`001_init.sql:31-32`) para os dois `LEFT JOIN` em `connection_profiles`.
- `ORDER BY created_at DESC LIMIT 50` roda sem índice dedicado em `created_at` — aceitável dado o volume baixo já assumido em todo o projeto (`target_data_model.md` § Restrições: "não aplicável — volume baixo, uso interno"); se o volume crescer, um índice em `created_at` (ou composto `(created_at, feature)`) é a otimização natural, fora de escopo desta entrega.

## Estado após a migration

```sql
CREATE TABLE migration_jobs (
    id                CHAR(36) PRIMARY KEY,
    feature           ENUM('routines','tables','config','reports','collation_fix') NOT NULL,
    source_profile_id CHAR(36) NULL,
    target_profile_id CHAR(36) NULL,
    status            ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
    error_message     TEXT NULL,                         -- adicionada por 002_add_job_error_message.sql
    params_json       JSON NOT NULL,
    started_at        TIMESTAMP NULL,
    finished_at       TIMESTAMP NULL,
    created_by        VARCHAR(120) NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- NOVA (esta feature)
    KEY ix_migration_jobs_feature_status (feature, status),
    CONSTRAINT fk_migration_jobs_source FOREIGN KEY (source_profile_id) REFERENCES connection_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_migration_jobs_target FOREIGN KEY (target_profile_id) REFERENCES connection_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## Query de leitura (não é migration, mas define o uso do delta acima)

```sql
SELECT
  j.id, j.feature, j.status, j.started_at, j.finished_at, j.created_by,
  j.error_message, j.created_at,
  sp.label AS source_profile_label,
  tp.label AS target_profile_label
FROM migration_jobs j
LEFT JOIN connection_profiles sp ON sp.id = j.source_profile_id
LEFT JOIN connection_profiles tp ON tp.id = j.target_profile_id
-- WHERE j.feature = ?  (opcional, D-04)
-- AND j.status = ?     (opcional, D-04)
ORDER BY j.created_at DESC
LIMIT 50;
```
