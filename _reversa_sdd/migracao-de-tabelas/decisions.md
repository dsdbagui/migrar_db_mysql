# migracao-de-tabelas — Decisões Arquiteturais

> Decisões que afetam especificamente esta unit. Fonte completa em `../adrs/`.

## ADR-0001 — Transformação de DDL via regex, não via parser SQL

- **Status:** Aceito (implícito) · **Confiança:** 🟡 INFERIDO

Mesma técnica usada em `migracao-de-rotinas`: cada correção de compatibilidade de tabela (`TABLE_TRANSFORMATIONS`) é uma função independente aplicando regex sobre o texto do DDL, seguindo o contrato `(ddl: str) -> tuple[str, Optional[Issue]]`.

**Por que importa para esta unit:** `fix_table_utf8` usa negative lookahead (`\butf8\b(?!mb)`) e depende de ordem (collations antes do charset) para não corromper `utf8mb4` já presente; `strip_foreign_keys` depende de uma regex única (`FK_CONSTRAINT_PATTERN`) capturar corretamente toda a cláusula `CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` — uma reimplementação via parser SQL real mudaria essa superfície de falsos positivos/negativos e precisaria revalidar toda a suíte de T-01 a T-10 em `tasks.md`.

Ver ADR completo em `../adrs/0001-transformacao-de-ddl-via-regex.md`.

## ADR-0002 — Recuperação automática de foreign keys em duas estratégias, com restauração posterior

- **Status:** Aceito (implícito) · **Confiança:** 🟡 INFERIDO

`apply_table` captura erros MySQL 1215/6125 e tenta, em ordem: (1) remover a FK da própria tabela sendo criada; (2) remover FKs órfãs de outras tabelas que ainda apontam para esta. As FKs removidas viram `fk_specs` estruturados, permitindo uma tentativa de restauração automática depois de todas as tabelas e dados migrados (`resolve_pending_foreign_keys`).

**Por que importa para esta unit:** é o núcleo de negócio mais complexo do projeto e a razão de existir de `strip_foreign_keys`, `find_referencing_fks`, `drop_referencing_fks` e `resolve_pending_foreign_keys` (T-04, T-05, T-09 em `tasks.md`). Uma reimplementação que tratasse erro de FK como fatal (sem recuperação) mudaria fundamentalmente o comportamento observável documentado em `state-machines.md` (ciclo de vida "Tabela").

**Trade-off aceito:** uma migração pode terminar `applied=True` numa tabela sem que todas as FKs originais tenham sido restauradas (`FK_NOT_RESTORED`, warning) — prioriza completar estrutura + dados sobre integridade referencial imediata.

Ver ADR completo em `../adrs/0002-recuperacao-automatica-de-foreign-keys-em-cascata.md`.

## ADR-0006 — DEFAULT real na coluna de destino, além da substituição em memória, ao copiar dados com NULL

- **Status:** Aceito (implícito — introduzido no commit `971bdf5`, 2026-09-14) · **Confiança:** 🟢 CONFIRMADO

`tables.column_defaults` aplica um valor de fallback em dois lugares simultâneos: `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` no destino (efeito permanente no schema) e substituição de `NULL` por esse mesmo valor em cada linha do lote, antes do `executemany` (efeito nesta cópia).

**Por que importa para esta unit:** um `DEFAULT` de coluna sozinho não evita o erro de `NOT NULL`, porque `copy_table_data` sempre envia `NULL` explícito quando a origem tem `NULL` — o MySQL só aplica `DEFAULT` quando a coluna é omitida da lista de valores, não quando o valor enviado é `NULL` literal. Uma reimplementação que aplicasse só um dos dois efeitos (só o `ALTER`, ou só a substituição em memória) deixaria de resolver a classe de erro "cannot be null" documentada em T-07/T-08 de `tasks.md`.

**Trade-off aceito:** o `DEFAULT` fica no schema do destino como efeito permanente, mesmo depois da migração — se essa não for a intenção do DBA, precisa ser removido manualmente (`DROP DEFAULT`), o script não oferece reversão automática. `_sql_literal()` monta o `ALTER TABLE` por interpolação de string (não por parâmetro bind do driver), aceitável porque a fonte do valor é a configuração do operador, não input de terceiros.

Ver ADR completo em `../adrs/0006-default-real-na-coluna-para-substituir-null-na-copia.md`.

## Relação com a filosofia de "dados e estrutura primeiro"

Ver `domain.md`, seção "Sobre a estratégia de recuperação de FK" e "Sobre substituir NULL por DEFAULT real ao copiar dados" — ambas ADR-0002 e ADR-0006 seguem a mesma prioridade de negócio implícita: a ferramenta prefere completar a migração apesar de dados/schema imperfeitos, deixando para o operador decidir o que fazer com as pendências (FK não restaurada, `DEFAULT` permanente) depois, em vez de bloquear a execução. 🟡 Qualquer nova transformação ou estratégia de recuperação adicionada a esta unit deveria seguir o mesmo critério para manter consistência.
