-- connection_profiles passa a ter dono e perde o banco fixo
-- (_reversa_forward/005-perfil-conexao-por-usuario, RN-02/RN-03, RF-08, data-delta.md § 2).
--
-- ATENÇÃO: apaga todos os connection_profiles existentes (decisão do operador em
-- /reversa-clarify — perfis antigos não têm dono, cada operador recadastra os seus, já autenticado).
--
-- migrate.ts reaplica TODAS as migrations a cada execução (sem tabela de controle), então tudo
-- aqui é condicionado a database_name ainda existir: depois da primeira aplicação, a coluna some
-- e os statements viram 'SELECT 1' — sem isso, cada "npm run migrate" apagaria os perfis de novo.
-- Não use ponto e vírgula em comentários deste arquivo: migrate.ts divide o SQL nesse caractere
-- sem entender comentários.
--
-- Jobs antigos que referenciam esses perfis (FK ON DELETE RESTRICT, 001_init.sql:31-32) fariam o
-- DELETE falhar. Em vez de apagar o histórico de jobs, eles são desassociados (profile_id = NULL,
-- colunas já nullable) — GET /jobs já usa LEFT JOIN e exibe esses jobs sem rótulo de perfil.
--
-- O rótulo passa a ser único por dono (user_id, label), não mais global: com perfis estritamente
-- privados, um rótulo repetido entre usuários diferentes não pode colidir nem revelar que o perfil
-- de outro usuário existe.
SET @needs_owner_migration := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'connection_profiles' AND COLUMN_NAME = 'database_name'
);

SET @ddl := IF(@needs_owner_migration = 1,
  'UPDATE migration_jobs SET source_profile_id = NULL, target_profile_id = NULL WHERE source_profile_id IS NOT NULL OR target_profile_id IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(@needs_owner_migration = 1,
  'DELETE FROM connection_profiles',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(@needs_owner_migration = 1,
  'ALTER TABLE connection_profiles DROP COLUMN database_name, ADD COLUMN user_id CHAR(36) NOT NULL AFTER label, DROP INDEX uq_connection_profiles_label, ADD UNIQUE KEY uq_connection_profiles_user_label (user_id, label), ADD CONSTRAINT fk_connection_profiles_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
