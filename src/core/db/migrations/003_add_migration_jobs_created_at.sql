-- Adiciona a coluna que falta para ordenar "mais recente primeiro" na listagem de jobs
-- (_reversa_forward/004-historico-de-jobs). Antes desta migration, migration_jobs não tinha
-- nenhuma coluna de timestamp de criação, diferente de connection_profiles e job_reports
-- (001_init.sql:15 e :72), que já seguem esse padrão.
-- MySQL real (ao contrário do MariaDB) não aceita "ADD COLUMN IF NOT EXISTS" — mesmo idioma
-- portátil de 002_add_job_error_message.sql: checar information_schema e montar o ALTER
-- dinamicamente só quando a coluna ainda não existe, para manter a reaplicação idempotente.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migration_jobs' AND COLUMN_NAME = 'created_at'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE migration_jobs ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
