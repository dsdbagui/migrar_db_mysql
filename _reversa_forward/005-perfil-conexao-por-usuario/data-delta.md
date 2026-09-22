# Data Delta: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`
> Modelo extraído de referência: `_reversa_sdd/migration/target_data_model.md`, `src/core/db/migrations/001_init.sql`–`003_add_migration_jobs_created_at.sql`

## 1. Tabelas novas

### `app_users`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | `CHAR(36)` PK | mesmo padrão UUID das demais tabelas do App DB |
| `username` | `VARCHAR(120)` `NOT NULL` `UNIQUE` | identificador de login (RF-03) |
| `password_hash` | `VARBINARY(256)` `NOT NULL` | saída de `crypto.scrypt` (D-03 do `roadmap.md`): salt (16 bytes) + chave derivada (64 bytes), formato análogo ao `password_enc` de `connection_profiles` (`credentialVault.ts`) — concatenados num único blob, nunca decifrável (diferente do cofre de credenciais MySQL, que é cifrado reversível) |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` | mesmo padrão de `connection_profiles`/`job_reports` |

Sem `updated_at`/reset de senha nesta entrega (RNF Escopo do `requirements.md` — reset fica fora do escopo).

### `app_sessions`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | `CHAR(64)` PK | token de sessão opaco (ex. 32 bytes aleatórios em hex), valor do cookie `httpOnly` |
| `user_id` | `CHAR(36)` `NOT NULL` | `CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE` — excluir um usuário (fora de escopo nesta entrega, mas previsto) encerra as sessões dele |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` | |
| `expires_at` | `TIMESTAMP NOT NULL` | `created_at` + 2h no momento da criação (RNF Segurança — duração de sessão, decidido em `/reversa-clarify`); o middleware (D-08) descarta como inválida qualquer sessão com `expires_at < NOW()`, sem renovação automática nesta entrega |

Logout (RF-04) é um `DELETE FROM app_sessions WHERE id = ?` — invalidação imediata, sem esperar expiração.

## 2. Alterações em tabelas existentes

### `connection_profiles` (`001_init.sql:7-18`)

| Mudança | Detalhe |
|---------|---------|
| Remove | `database_name VARCHAR(120)` — RN-03, banco deixa de viver no perfil |
| Adiciona | `user_id CHAR(36) NOT NULL`, `CONSTRAINT fk_connection_profiles_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE` — RN-02, perfil passa a ter dono; `ON DELETE CASCADE` porque um perfil sem dono não faz sentido no novo modelo (diferente de `migration_jobs`, que usa `RESTRICT` para não perder histórico) |
| Dado existente | Linhas hoje cadastradas (ex. as da VM `hermes`, `docs/deploy-hermes.md`) são **apagadas** pela própria migration (`DELETE FROM connection_profiles` antes do `ALTER`) — decidido em `/reversa-clarify`: sem tentativa de atribuir a um usuário seed, cada operador recadastra o que precisar, já autenticado |
| Nota operacional | Ver `roadmap.md` § Riscos — se `migration_jobs` ainda tiver linhas referenciando um `connection_profile` (FK `ON DELETE RESTRICT` em `migration_jobs.source_profile_id`/`target_profile_id`, `001_init.sql:31-32`), o `DELETE` falha. Nesse caso a migration precisa também aceitar apagar (ou desassociar) os `migration_jobs`/`job_items` órfãos antigos — decisão operacional de quem aplicar a migration, não coberta por `/reversa-clarify` (nenhum job de teste real foi mencionado pelo operador); registrar a ordem real usada no `onboarding.md` no momento da execução |

### `migration_jobs` (`001_init.sql:20-33`, já alterada por `002`/`003`)

| Mudança | Detalhe |
|---------|---------|
| Adiciona | `source_database VARCHAR(120) NULL` — espelha a nullability de `source_profile_id` (nulo quando a feature não usa origem, ex. um futuro `collation_fix`) |
| Adiciona | `target_database VARCHAR(120) NOT NULL DEFAULT ''` — todo job hoje implementado (`tables`, `routines`) sempre tem destino; `DEFAULT ''` é só para permitir o `ALTER` sem quebrar linhas antigas já concluídas, que nunca serão lidas de novo com esse campo (mesmo raciocínio de `error_message`/`created_at` nas features `002`/`004`, nenhum backfill retroativo real) |

## 3. SQL de migração (rascunho — refinar em `/reversa-coding`)

```sql
-- 004_add_app_auth.sql
CREATE TABLE IF NOT EXISTS app_users (
    id            CHAR(36) PRIMARY KEY,
    username      VARCHAR(120) NOT NULL,
    password_hash VARBINARY(256) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
    id         CHAR(64) PRIMARY KEY,
    user_id    CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

```sql
-- 005_connection_profiles_owner.sql
DELETE FROM connection_profiles;
ALTER TABLE connection_profiles
    DROP COLUMN database_name,
    ADD COLUMN user_id CHAR(36) NOT NULL AFTER label,
    ADD CONSTRAINT fk_connection_profiles_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
```

```sql
-- 006_migration_jobs_database_columns.sql
ALTER TABLE migration_jobs
    ADD COLUMN source_database VARCHAR(120) NULL AFTER source_profile_id,
    ADD COLUMN target_database VARCHAR(120) NOT NULL DEFAULT '' AFTER target_profile_id;
```

## 4. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
