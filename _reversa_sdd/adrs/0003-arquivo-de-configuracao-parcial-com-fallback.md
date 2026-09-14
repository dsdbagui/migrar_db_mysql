# ADR-0003 — Arquivo de configuração JSON opcional com fallback por chave, não tudo-ou-nada

- **Status:** Aceito (implícito)
- **Confiança:** 🟡 INFERIDO

## Contexto

O fluxo interativo tem dezenas de perguntas (conexões, seleção de rotinas/tabelas, modo de migração, filtros, etc.). Rodar a ferramenta repetidamente (ex: reprocessar após corrigir um erro) exige responder tudo de novo manualmente.

## Decisão

`--config` aceita um JSON parcial: cada chave resolvida via `cfg()`/`cfg_ask()`/`cfg_confirm()` usa o dotted-path (ex: `"tables.force_innodb"`) e cai automaticamente para o prompt interativo original se a chave não existir no arquivo — não há validação de schema nem exigência de preencher tudo. `--init-config` gera um template com todas as chaves possíveis e comentários explicativos embutidos (`_comment_*`) para facilitar o preenchimento.

## Consequências

- ✅ Permite semi-automação incremental: o operador pode preencher só as respostas que quer fixar (ex: sempre as mesmas credenciais) e deixar o resto interativo.
- ✅ Reduz risco de "big bang" — um erro de digitação numa chave não quebra a execução, apenas volta a perguntar aquele item (comportamento sem alerta explícito — ver lacuna abaixo).
- ⚠️ Sem validação de schema, uma chave grafada errado falha silenciosamente (a pergunta correspondente volta a ser interativa em vez de reportar "chave desconhecida") — documentado como lacuna 🟡 em `code-analysis.md`, feature `arquivo-de-configuracao`.
- ⚠️ `select_items` via config usa **nomes exatos**, não índices — decisão deliberada e correta (índices mudam entre execuções conforme o schema evolui), mas significa que a lista de rotinas/tabelas no config precisa ser mantida sincronizada manualmente com o schema de origem.
