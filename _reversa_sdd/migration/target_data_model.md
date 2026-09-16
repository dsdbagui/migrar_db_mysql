---
schemaVersion: 1
generatedAt: 2026-09-15T20:45:00Z
reversa:
  version: "1.3.3"
kind: target_data_model
producedBy: designer
hash: "sha256:be3fa727fb76c9152ac03744dded63c318ed7f4da4ef7db15ec4680161700ad3"
---

# Target Data Model

> Modelo de dados do sistema novo. Schema, relacionamentos e restrições.
>
> **Nota fundamental**: este projeto não migra "dados de aplicação" no sentido tradicional — o legado nunca teve um banco de dados aplicacional próprio (`erd-complete.md`: "não há schema de banco de dados aplicacional próprio"). O que existe abaixo é o schema **novo** que a aplicação web precisa para ter estado (perfis de conexão, jobs, histórico), algo que o CLI legado nunca teve. Os bancos MySQL de origem/destino que a ferramenta migra continuam sendo schemas arbitrários descobertos em runtime — não fazem parte deste modelo.

## Visão geral

Um único banco relacional (App DB) — recomendação: um schema dedicado no próprio MySQL 8.x já usado como destino nas migrações (`app_migracao`), papel puramente OLTP, baixo volume (uso interno, poucos operadores). Três grupos de tabelas: perfis de conexão (cofre), jobs + itens de job (estado de execução), e histórico de relatórios.

## Entidades de dados

| Entidade | Tabela / coleção | Aggregate dono | PK | Bounded context |
|---|---|---|---|---|
| Perfil de conexão | `connection_profiles` | AGG-ConnectionProfile | `id` | BC-02 (Configuração e Execução) |
| Job de migração | `migration_jobs` | AGG-MigrationJob | `id` | BC-01/BC-04 (conforme `feature`) |
| Item de job | `job_items` | AGG-MigrationJob | `id` | BC-01/BC-04 |
| FK pendente | `job_item_fk_specs` | AGG-MigrationJob (via Item) | `id` | BC-01 (tables) |
| Relatório/histórico | `job_reports` | BC-03 (Auditoria e Relatório) | `id` | BC-03 |

## Schema (DDL ou equivalente)

```sql
-- Schema novo da aplicação web (app_migracao). Não confundir com os bancos MySQL sendo migrados.

CREATE TABLE connection_profiles (
    id            CHAR(36) PRIMARY KEY,
    label         VARCHAR(120) NOT NULL,
    host          VARCHAR(255) NOT NULL,
    port          INT NOT NULL DEFAULT 3306,
    user          VARCHAR(120) NOT NULL,
    password_enc  VARBINARY(512) NOT NULL,      -- cifrado em repouso, nunca em texto claro (BR-MIGRAR-015)
    database_name VARCHAR(120),
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE migration_jobs (
    id                CHAR(36) PRIMARY KEY,
    feature           ENUM('routines','tables','config','reports','collation_fix') NOT NULL,
    source_profile_id CHAR(36) NULL REFERENCES connection_profiles(id),   -- NULL para collation_fix (banco único)
    target_profile_id CHAR(36) NULL REFERENCES connection_profiles(id),
    status            ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
    params_json       JSON NOT NULL,             -- payload do wizard: seleção, filtros, column_defaults, force_innodb, old_collation, etc.
    started_at        TIMESTAMP NULL,
    finished_at       TIMESTAMP NULL,
    created_by        VARCHAR(120) NOT NULL      -- identificação do operador (não existia no legado — ver Notas)
);

CREATE TABLE job_items (
    id             CHAR(36) PRIMARY KEY,
    job_id         CHAR(36) NOT NULL REFERENCES migration_jobs(id),
    item_type      ENUM('routine','table','collation_routine') NOT NULL,
    name           VARCHAR(255) NOT NULL,
    applied        BOOLEAN NOT NULL DEFAULT FALSE,
    skipped        BOOLEAN NOT NULL DEFAULT FALSE,
    apply_error    TEXT NULL,
    extract_error  TEXT NULL,
    rows_copied    INT NULL,
    copy_error     TEXT NULL,
    ddl_original   MEDIUMTEXT NULL,
    ddl_fixed      MEDIUMTEXT NULL,
    issues_json    JSON NOT NULL DEFAULT ('[]')  -- lista de Issue serializada
);

CREATE TABLE job_item_fk_specs (
    id            CHAR(36) PRIMARY KEY,
    job_item_id   CHAR(36) NOT NULL REFERENCES job_items(id),
    fk_name       VARCHAR(120) NOT NULL,
    child_table   VARCHAR(120) NOT NULL,
    child_cols    JSON NOT NULL,
    ref_table     VARCHAR(120) NOT NULL,
    ref_cols      JSON NOT NULL,
    extra         VARCHAR(255) NOT NULL DEFAULT '',
    restored      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE job_reports (
    id           CHAR(36) PRIMARY KEY,
    job_id       CHAR(36) NOT NULL REFERENCES migration_jobs(id),
    report_json  JSON NOT NULL,
    report_html  MEDIUMTEXT NOT NULL,
    migration_sql MEDIUMTEXT NOT NULL,
    retry_sql    MEDIUMTEXT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Relacionamentos

| Origem | Destino | Cardinalidade | Integridade | Notas |
|---|---|---|---|---|
| `migration_jobs.source_profile_id` | `connection_profiles.id` | N:1 | FK ON DELETE RESTRICT | não permite apagar um perfil em uso por um job histórico |
| `migration_jobs.target_profile_id` | `connection_profiles.id` | N:1 | FK ON DELETE RESTRICT | idem |
| `job_items.job_id` | `migration_jobs.id` | N:1 | FK ON DELETE CASCADE | item não existe sem o job |
| `job_item_fk_specs.job_item_id` | `job_items.id` | N:1 | FK ON DELETE CASCADE | espelha o relacionamento lógico já documentado em `erd-complete.md` |
| `job_reports.job_id` | `migration_jobs.id` | 1:1 | FK ON DELETE CASCADE | um relatório por job |

## Restrições

- **Unicidade**: `connection_profiles.label` único (evita perfis duplicados confusos no wizard).
- **Integridade referencial**: ativada normalmente neste banco de aplicação (`FOREIGN_KEY_CHECKS=1`) — diferente dos bancos de destino sendo migrados, onde `FOREIGN_KEY_CHECKS=0` é usado deliberadamente durante a aplicação (BR-MIGRAR-006). Não confundir os dois contextos.
- **Particionamento / sharding**: não aplicável — volume baixo (uso interno).
- **Índices críticos**: `migration_jobs(feature, status)` para consultas de "jobs em andamento por feature" no dashboard/wizard.

## Considerações específicas do paradigma alvo

- O paradigma alvo é híbrido/balanced, não event-driven — não há necessidade de tabela de outbox nem event store.
- `job_items` funciona como o mecanismo de persistência incremental de progresso mencionado em `target_architecture.md` AD-01 (mitigação de RISK-004): cada item é gravado assim que processado, não só ao final do job, permitindo que o operador consulte progresso parcial mesmo se o processo do servidor reiniciar no meio de uma migração longa.

## Origem no legado

| Tabela / coleção nova | Origem no legado | Transformação |
|---|---|---|
| `connection_profiles` | (nenhuma) | novo (BR-HUMANA-002) |
| `migration_jobs` | (nenhuma — mais próximo é o dict de contexto transiente em `main()`) | novo |
| `job_items` | `routine_results` / `table_results` (dicts em memória, nunca persistidos como tabela) | novo, mas schema 1-para-1 com os campos documentados em `data-dictionary.md` |
| `job_item_fk_specs` | `fk_specs` (dict em memória) | novo, schema 1-para-1 |
| `job_reports` | `migration_report_<timestamp>/` (diretório em disco com `report.json`/`.html`/`.sql`) | novo — o **conteúdo** é o mesmo, a persistência muda de arquivos em disco para linhas de banco consultáveis pela UI |

## Notas

O campo `migration_jobs.created_by` introduz um dado que o legado explicitamente não tinha (ver `permissions.md`, onde a ausência de "quem rodou a migração" foi confirmada como não relevante pelo operador, `questions.md#pergunta-9`) — mas aqui ele existe por uma razão diferente e local: numa aplicação web multiusuário (mesmo que via VPN interna), saber qual job pertence a qual sessão/operador é necessário para o próprio funcionamento do wizard (filtrar "meus jobs"), não para fins de auditoria formal. Não é uma contradição com a decisão do operador — é uma necessidade técnica de UI, não um requisito de compliance.
