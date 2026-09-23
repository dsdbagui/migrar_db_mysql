# Data Delta: Entrada segura de senha no create-user e redefinição de senha

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Modelo de referência: `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md` (tabelas `app_users`, `app_sessions`), `src/core/db/migrations/004_add_app_auth.sql`

## 1. Tabelas novas

Nenhuma.

## 2. Alterações de schema

Nenhuma. **Não há migration nesta feature.**

## 3. Mudanças de comportamento sobre dados existentes

| Tabela | Antes (`005`) | Depois (`006`) |
|--------|---------------|----------------|
| `app_users.password_hash` | Só escrito no `INSERT` de `createAppUser` | Também atualizado por `changePassword` (`UPDATE ... WHERE id = ?`), no mesmo formato de 83 bytes (`passwordHash.ts`) |
| `app_sessions` | Linhas apagadas uma a uma (`DELETE ... WHERE id = ?`, logout) ou nunca apagadas (expiradas ficam na tabela) | Também apagadas em massa por usuário (`DELETE ... WHERE user_id = ?`), na mesma transação da troca de hash |
| `app_users.password_hash` (dados legados) | Senhas de qualquer tamanho ≥ 1 | Senhas curtas já gravadas **não** são revalidadas nem invalidadas. A política de 8 caracteres só vale na próxima gravação |

## 4. Transação

A troca de senha é a primeira operação do App DB com transação explícita:

```sql
START TRANSACTION;
UPDATE app_users SET password_hash = ? WHERE id = ?;
DELETE FROM app_sessions WHERE user_id = ?;
COMMIT;   -- ou ROLLBACK em qualquer erro
```

Ambas as tabelas são InnoDB (`004_add_app_auth.sql`), então a transação é suportada.

## 5. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
