# ADR-0006 — DEFAULT real aplicado na coluna de destino, além da substituição em memória, ao copiar dados com NULL

- **Status:** Aceito (implícito — introduzido no commit `971bdf5`, 2026-09-14)
- **Confiança:** 🟢 CONFIRMADO (lido diretamente do diff e do código atual)

## Contexto

Ao copiar dados de uma tabela de origem para uma tabela de destino já criada com uma coluna `NOT NULL` (sem `DEFAULT` implícito, ou com `DEFAULT` definido só no schema mas não na sessão), linhas de origem com `NULL` nessa coluna quebram o `INSERT` sob `sql_mode` estrito (`STRICT_TRANS_TABLES`, padrão do MySQL 8) com erro "Column '...' cannot be null". Um `DEFAULT` na definição da coluna **não** resolve isso sozinho: o driver envia `NULL` explicitamente no `INSERT`, e o MySQL só aplica o `DEFAULT` quando a coluna é omitida da lista de colunas/valores — não quando o valor enviado é `NULL` literal.

## Decisão

`tables.column_defaults` (config) ou a pergunta interativa equivalente definem, por tabela e coluna, um valor de fallback (`"hoje"`/`"today"` vira a data atual via `_resolve_default_value`; qualquer outro valor é usado como literal). Esse valor é aplicado em **dois lugares simultaneamente**, não apenas um:

1. `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT <literal>` no destino — registra o valor como `DEFAULT` real da coluna (efeito colateral permanente no schema, não só nesta execução).
2. `copy_table_data(..., column_defaults=...)` substitui `None` por esse mesmo valor em cada linha do lote, antes do `executemany`, via a closure `apply_defaults`.

O passo (1) sozinho não bastaria para o `INSERT` explícito de `NULL` (ver Contexto); o passo (2) sozinho deixaria a coluna sem `DEFAULT` para inserções futuras fora do script. Os dois juntos cobrem tanto a carga de dados desta migração quanto o uso da tabela depois dela.

## Consequências

- ✅ Resolve a classe de erro "cannot be null" sem exigir que o DBA edite o schema de origem ou pré-processe os dados manualmente antes de migrar.
- ✅ O `DEFAULT` fica no schema do destino como efeito permanente — inserções futuras (fora do script) em linhas com essa coluna omitida também se beneficiam.
- ⚠️ `_sql_literal()` monta o `ALTER TABLE` por interpolação de string (escapando aspas simples manualmente), não por parâmetro bind do driver — aceitável porque a fonte do valor é a configuração do operador (`--config` ou prompt interativo), não input de terceiros, mas é uma divergência do padrão usado no resto do código (`cursor.execute(sql, params)` com bind em todo o restante do script).
- ⚠️ Cada `ALTER TABLE ... SET DEFAULT` roda em `try/except MySQLError` isolado por coluna — uma falha numa coluna (`warn`, não `error`) não aborta as demais nem a cópia de dados da tabela; o valor ainda é substituído em memória pelo passo (2) mesmo que o passo (1) falhe, então o `INSERT` desta execução funciona de qualquer forma.
- ⚠️ O `DEFAULT` setado no destino permanece mesmo depois da migração — se não for essa a intenção do DBA (ex: valor "hoje" fixo como default permanente), é preciso removê-lo manualmente depois (`ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT`), o script não oferece essa reversão.
