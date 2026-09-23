-- Banco de origem/destino passa a ser escolhido por job, não mais pelo perfil de conexão
-- (_reversa_forward/005-perfil-conexao-por-usuario, D-07 do roadmap.md). Colunas próprias, não
-- dentro de params_json, porque runJob precisa do banco antes de invocar o FeatureRunner.
-- target_database DEFAULT '' só existe para o ALTER não quebrar jobs antigos já concluídos —
-- runJob trata '' como "sem banco explícito" (sem backfill retroativo, mesmo raciocínio de 002/003).
-- Mesmo idioma portátil de 002/003: MySQL real não aceita "ADD COLUMN IF NOT EXISTS".
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migration_jobs' AND COLUMN_NAME = 'source_database'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE migration_jobs ADD COLUMN source_database VARCHAR(120) NULL AFTER source_profile_id',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migration_jobs' AND COLUMN_NAME = 'target_database'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE migration_jobs ADD COLUMN target_database VARCHAR(120) NOT NULL DEFAULT '''' AFTER target_profile_id',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
