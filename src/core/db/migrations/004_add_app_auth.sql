-- Autenticação de aplicação (_reversa_forward/005-perfil-conexao-por-usuario, data-delta.md § 1).
-- app_users: usuários da própria aplicação web (não confundir com usuários MySQL de
-- connection_profiles). password_hash é saída de scrypt (salt || chave derivada), irreversível
-- por design — diferente de connection_profiles.password_enc, que é cifrado reversível (RF-02).
-- app_sessions: sessão opaca referenciada pelo cookie httpOnly "session", expiração fixa de 2h
-- (D-01 do roadmap.md). Logout = DELETE da linha.

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
    KEY ix_app_sessions_user (user_id),
    CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
