-- Adiciona coluna para persistir a mensagem de erro de um job que falhou inteiro
-- (antes desta migration, migration_jobs não tinha nenhuma coluna de erro — ver
-- _reversa_forward/002-timeout-conexao-job/investigation.md).
-- MySQL real (ao contrário do MariaDB) não aceita "ADD COLUMN IF NOT EXISTS" — o padrão
-- idempotente de 001_init.sql (reaplicado a cada execução do runner, sem tabela de controle
-- de migrations já aplicadas) precisa do idioma portátil abaixo: checar information_schema
-- e montar o ALTER dinamicamente só quando a coluna ainda não existe.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migration_jobs' AND COLUMN_NAME = 'error_message'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE migration_jobs ADD COLUMN error_message TEXT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
