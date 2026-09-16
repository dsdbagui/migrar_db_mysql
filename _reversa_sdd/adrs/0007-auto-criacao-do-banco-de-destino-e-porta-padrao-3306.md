# ADR-0007 — Auto-criação do banco de destino em erro 1049, e porta padrão do destino alinhada à de origem

- **Status:** Aceito (implícito — introduzido no commit `971bdf5`, 2026-09-14)
- **Confiança:** 🟢 CONFIRMADO

## Contexto

Antes deste commit, `connect()` falhava com erro genérico sempre que o banco de destino ainda não existia (MySQL 1049 — "Unknown database"), exigindo que o operador criasse o banco manualmente fora do script antes de tentar de novo. Além disso, a porta padrão sugerida para o destino era `3307` — um valor específico de algum cenário de setup local (provavelmente dois MySQL na mesma máquina, origem em `3306` e destino em `3307`), que não é a convenção geral (a maioria dos destinos MySQL 8 roda na porta padrão `3306`, inclusive em containers/hosts dedicados).

## Decisão

- `ask_connection(..., create_db_if_missing=True)` é usado especificamente para a conexão de destino em `main()`. Quando `connect()` recebe erro 1049 com essa flag ativa, oferece (via `cfg_confirm("destination.create_database_if_missing", ...)`) criar o banco com `CREATE DATABASE IF NOT EXISTS ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` usando uma conexão administrativa separada (sem `database` selecionado), e então reconecta normalmente.
- O default de porta do destino mudou de `3307` para `3306`, e o campo `database` do destino agora sugere como default o mesmo nome do banco de origem (`src_params.get("database", "")`) — na maioria dos casos reais o DBA está migrando o *mesmo* banco lógico para um novo servidor, não renomeando.

## Consequências

- ✅ Elimina uma interrupção manual comum (criar o banco de destino via cliente MySQL separado antes de rodar o script) no caso de uso mais frequente: destino é um servidor MySQL 8 novo, ainda sem esse banco.
- ✅ `utf8mb4`/`utf8mb4_0900_ai_ci` como charset/collation fixos da criação automática seguem a recomendação padrão do MySQL 8 — consistente com `fix_table_utf8` (ver `code-analysis.md`), que já converte tabelas para `utf8mb4` durante a migração.
- ⚠️ A criação usa uma conexão administrativa adicional com as mesmas credenciais informadas para o destino — o usuário/senha do destino precisa ter privilégio `CREATE` a nível de servidor, não só no banco alvo (que ainda não existe). Não há validação prévia desse privilégio; se faltar, o erro aparece só na tentativa de `CREATE DATABASE`.
- ⚠️ Porta e sugestão de banco são apenas *defaults* de prompt — não mudam comportamento para quem já usa `--config` com esses campos preenchidos explicitamente.
