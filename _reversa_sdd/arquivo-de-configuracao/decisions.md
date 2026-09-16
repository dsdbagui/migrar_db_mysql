# arquivo-de-configuracao — Decisões Arquiteturais

> Decisões que afetam especificamente esta unit. Fonte completa em `../adrs/`.

## ADR-0003 — Arquivo de configuração JSON opcional com fallback por chave, não tudo-ou-nada

- **Status:** Aceito (implícito) · **Confiança:** 🟡 INFERIDO

`--config` aceita um JSON parcial: cada chave resolvida via `cfg()`/`cfg_ask()`/`cfg_confirm()` usa o caminho com pontos (dotted-path) e cai automaticamente para o prompt interativo original se a chave não existir — sem validação de schema nem exigência de preencher tudo. `--init-config` gera um template com todas as chaves possíveis e comentários explicativos embutidos (`_comment_*`).

**Por que importa para esta unit:** é a decisão fundadora de toda a unit — sem o fallback por chave, `--config` teria que ser tudo-ou-nada, tornando a semi-automação incremental (reprocessar só respondendo o que mudou) impossível. É o contrato que `cfg`/`cfg_ask`/`cfg_confirm`/`select_items` implementam (T-01 a T-04 em `tasks.md`).

**Trade-off aceito:** sem validação de schema, uma chave grafada errada falha silenciosamente (a pergunta correspondente volta a ser interativa em vez de reportar "chave desconhecida"). `select_items` via config usa nomes exatos, não índices — correto para sobreviver a mudanças de schema, mas exige que o operador mantenha a lista sincronizada manualmente.

Ver ADR completo em `../adrs/0003-arquivo-de-configuracao-parcial-com-fallback.md`.

## ADR-0007 — Auto-criação do banco de destino em erro 1049, e porta padrão do destino alinhada à de origem

- **Status:** Aceito (implícito — introduzido no commit `971bdf5`, 2026-09-14) · **Confiança:** 🟢 CONFIRMADO

`destination.create_database_if_missing` (resolvido via `cfg_confirm`) habilita `connect()` a reagir ao erro MySQL 1049 oferecendo criar o banco (`CREATE DATABASE IF NOT EXISTS ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`) em vez de abortar a conexão. A porta padrão sugerida para o destino mudou de `3307` para `3306`, e o campo `database` do destino agora sugere o mesmo nome do banco de origem como default.

**Por que importa para esta unit:** embora o comportamento de `connect()`/`ask_connection()` em si pertença à infraestrutura compartilhada de conexão (não exclusiva desta unit), a chave que o habilita (`destination.create_database_if_missing`) e os novos defaults de prompt (`port`, `database`) fazem parte diretamente do schema `CONFIG` e do template gerado por `write_config_template` — é por isso que esta unit é a dona natural do registro dessa decisão, mesmo a execução em si acontecendo no Connection Manager.

**Trade-off aceito:** a criação automática usa uma conexão administrativa adicional com as mesmas credenciais do destino — exige privilégio `CREATE` a nível de servidor, não só no banco alvo, sem validação prévia desse privilégio. Porta e sugestão de banco são apenas defaults de prompt — não mudam nada para quem já usa `--config` com esses campos preenchidos explicitamente.

Ver ADR completo em `../adrs/0007-auto-criacao-do-banco-de-destino-e-porta-padrao-3306.md`.

## Relação com a falta de validação de schema

Ver `design.md`, seção "Riscos e Lacunas" — a decisão de ADR-0003 de não validar schema é a causa raiz direta da lacuna "chave grafada errada falha silenciosamente" registrada em `code-analysis.md`. Qualquer chave nova adicionada ao `CONFIG` (como as duas introduzidas em `971bdf5`, `destination.create_database_if_missing` e `tables.column_defaults`) herda esse mesmo risco — não há mecanismo automático que avise o operador se o nome da chave nova foi digitado errado no JSON. 🟡
