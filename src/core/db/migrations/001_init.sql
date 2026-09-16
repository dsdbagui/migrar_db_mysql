-- App DB — schema novo da aplicação web (target_data_model.md).
-- Note: o DDL ilustrativo em target_data_model.md usa REFERENCES em nível de coluna;
-- aqui usamos CONSTRAINT ... FOREIGN KEY explícito, porque o InnoDB não aplica a
-- forma inline de REFERENCES como constraint real (comportamento diferente do
-- ilustrado na spec, corrigido aqui para produzir integridade referencial de fato).

CREATE TABLE IF NOT EXISTS connection_profiles (
    id            CHAR(36) PRIMARY KEY,
    label         VARCHAR(120) NOT NULL,
    host          VARCHAR(255) NOT NULL,
    port          INT NOT NULL DEFAULT 3306,
    user          VARCHAR(120) NOT NULL,
    password_enc  VARBINARY(512) NOT NULL,
    database_name VARCHAR(120),
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_connection_profiles_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_jobs (
    id                CHAR(36) PRIMARY KEY,
    feature           ENUM('routines','tables','config','reports','collation_fix') NOT NULL,
    source_profile_id CHAR(36) NULL,
    target_profile_id CHAR(36) NULL,
    status            ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
    params_json       JSON NOT NULL,
    started_at        TIMESTAMP NULL,
    finished_at       TIMESTAMP NULL,
    created_by        VARCHAR(120) NOT NULL,
    KEY ix_migration_jobs_feature_status (feature, status),
    CONSTRAINT fk_migration_jobs_source FOREIGN KEY (source_profile_id) REFERENCES connection_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_migration_jobs_target FOREIGN KEY (target_profile_id) REFERENCES connection_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_items (
    id             CHAR(36) PRIMARY KEY,
    job_id         CHAR(36) NOT NULL,
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
    issues_json    JSON NOT NULL,
    CONSTRAINT fk_job_items_job FOREIGN KEY (job_id) REFERENCES migration_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_item_fk_specs (
    id            CHAR(36) PRIMARY KEY,
    job_item_id   CHAR(36) NOT NULL,
    fk_name       VARCHAR(120) NOT NULL,
    child_table   VARCHAR(120) NOT NULL,
    child_cols    JSON NOT NULL,
    ref_table     VARCHAR(120) NOT NULL,
    ref_cols      JSON NOT NULL,
    extra         VARCHAR(255) NOT NULL DEFAULT '',
    restored      BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_job_item_fk_specs_item FOREIGN KEY (job_item_id) REFERENCES job_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_reports (
    id            CHAR(36) PRIMARY KEY,
    job_id        CHAR(36) NOT NULL,
    report_json   JSON NOT NULL,
    report_html   MEDIUMTEXT NOT NULL,
    migration_sql MEDIUMTEXT NOT NULL,
    retry_sql     MEDIUMTEXT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_job_reports_job (job_id),
    CONSTRAINT fk_job_reports_job FOREIGN KEY (job_id) REFERENCES migration_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
