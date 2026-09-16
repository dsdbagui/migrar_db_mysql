# migracao-de-tabelas — Design Técnico

> Fonte: `code-analysis.md` (Feature: migracao-de-tabelas), `flowcharts/migracao-de-tabelas.md`, `data-dictionary.md`, `state-machines.md`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Interface

Não há endpoints HTTP — interface é CLI interativa (ou `--config` JSON). Símbolos principais:

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `fetch_tables` | `(conn, database: str)` | `list[dict]` | Um dict por tabela, com `ddl_original` ou `extract_error` |
| `transform_table_ddl` | `(ddl: str, force_innodb: bool = False)` | `tuple[str, list[Issue]]` | Roda `TABLE_TRANSFORMATIONS`; adiciona `fix_table_engine_to_innodb` só se `force_innodb=True` |
| `apply_table` | `(conn, database: str, ddl: str)` | `tuple[Optional[str], str, list[Issue], list[dict]]` | `(erro\|None, ddl_efetivamente_aplicado, issues_extras, fk_specs_removidas)` |
| `strip_foreign_keys` | `(ddl: str)` | `tuple[str, list[Issue], list[dict]]` | Remove `CONSTRAINT ... FOREIGN KEY` do próprio DDL via `FK_CONSTRAINT_PATTERN` |
| `find_referencing_fks` | `(conn, database: str, table_name: str)` | `list[dict]` | Consulta `KEY_COLUMN_USAGE`/`REFERENTIAL_CONSTRAINTS` por FKs de outras tabelas apontando para esta |
| `drop_referencing_fks` | `(conn, database: str, table_name: str)` | `tuple[list[dict], list[Issue]]` | Executa `ALTER TABLE ... DROP FOREIGN KEY` para cada FK órfã encontrada |
| `resolve_pending_foreign_keys` | `(conn, database: str, pending_fks: list[dict])` | `list[dict]` | Tenta restaurar cada FK removida; retorna os resultados (`FK_RESTORED`/`FK_NOT_RESTORED`) |
| `copy_table_data` | `(src_conn, dst_conn, src_db, dst_db, table, where=None, column_defaults=None)` | `tuple[int, Optional[str]]` | `(linhas_copiadas, copy_error\|None)` — 🟡 assinatura completa inferida do uso em `main()`, não citada literalmente no code-analysis |
| `_resolve_default_value` | `(raw: str)` | `str` | `"hoje"`/`"today"` → data atual ISO; qualquer outro valor é literal |
| `_sql_literal` | `(value: str)` | `str` | Escapa aspas simples e envolve em aspas simples, para uso direto em `SET DEFAULT` |

## Fluxo Principal

1. `fetch_tables(conn_src, src_db)` — `information_schema.TABLES` + `SHOW CREATE TABLE` por tabela (`migrate_routines.py:388`). 🟢
2. Tabela com todas as tabelas extraídas é exibida ao operador; `select_items()` resolve quais migrar (`tables.select` ou prompt). 🟢
3. Operador decide `copy_data` (schema-only vs. schema+dados), depois `skip_create` (tabelas já existem no destino). 🟢
4. Se não `skip_create`, pergunta `force_innodb`. 🟢
5. Se `copy_data`, pergunta filtros `WHERE` por tabela e, opcionalmente, `column_defaults` por tabela/coluna (loop interativo até Enter vazio, ou via `tables.column_defaults` no config). 🟢
6. Preview de compatibilidade: `transform_table_ddl` roda sobre as tabelas selecionadas para mostrar contagem de erros/avisos antes da confirmação. 🟢
7. Se confirmado: `SET FOREIGN_KEY_CHECKS=0` uma única vez antes do loop. 🟢
8. Para cada tabela selecionada: `ensure_connected` origem/destino → se `skip_create`, marca `applied=true` sem DDL; senão, se `ddl_original` ausente marca `skipped`; senão `transform_table_ddl` → `drop_table_if_exists` (se `drop_existing`) → `apply_table` (com recuperação de FK, ver seção própria). 🟢
9. Se a tabela tem `column_defaults` configurados e o esquema foi criado (ou já existia via `skip_create`), roda `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` por coluna, cada uma em `try/except` isolado, **antes** da cópia de dados. 🟢
10. Se `copy_data`, `copy_table_data` copia em lotes de 500 (`BATCH_SIZE`), aplicando `column_defaults` em memória a cada lote. 🟢
11. FKs removidas durante `apply_table` acumulam em `pending_fks`. Ao final do loop, se houver pendências, pergunta se restaura (`resolve_pending_foreign_keys`). 🟢
12. `SET FOREIGN_KEY_CHECKS=1` ao final. Resultado acumulado em `table_results` (ver `data-dictionary.md`). 🟢

Ver diagrama completo em `../flowcharts/migracao-de-tabelas.md`.

## Fluxos Alternativos

- **Tabela sem DDL extraído:** marcada `skipped=true` imediatamente, sem tentar transformar/aplicar; loop continua. 🟢
- **`skip_create=true`:** nenhum `CREATE`/`DROP TABLE` é emitido; `applied=true` é assumido diretamente — mas o `ALTER TABLE ... SET DEFAULT` de `column_defaults` ainda roda, se configurado. 🟢
- **`apply_table` falha com erro que não é 1215/6125:** nenhuma tentativa de recuperação — erro retornado diretamente como `apply_error`. 🟢
- **`apply_table` falha mesmo após as duas estratégias de recuperação de FK:** último erro capturado é retornado; tabela fica com `apply_error`, dados não são copiados para ela (o loop segue para a próxima tabela). 🟢
- **`ALTER TABLE ... SET DEFAULT` falha numa coluna:** `warn()` isolado; não aborta as demais colunas nem a cópia da tabela; nenhuma `Issue` estruturada é gerada para essa falha específica (ver Riscos e Lacunas). 🟡
- **FK pendente com duplicata na coluna referenciada no momento da restauração:** não tenta criar `UNIQUE KEY`; fica `FK_NOT_RESTORED` (warning), sem nova tentativa depois. 🟢

## Dependências

- **Connection Manager** (`connect`/`ask_connection`/`ensure_connected`) — fornece `conn_src`/`conn_dst`. Compartilhado com `migracao-de-rotinas`. 🟢
- **Config Resolver** (`cfg`/`cfg_ask`/`cfg_confirm`/`select_items`) — resolve `tables.*` via `--config` com fallback interativo. Ver unit `arquivo-de-configuracao`. 🟢
- **Output Helpers** (`info/ok/warn/error/header`) — toda comunicação com o operador. 🟢
- **`Issue`** — mesma classe usada por `migracao-de-rotinas`, reaproveitada para issues de transformação de tabela e de recuperação/restauração de FK. 🟢
- **Report Generator** — consome `table_results` ao final da execução. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Transformação de DDL via regex, mesma técnica de `migracao-de-rotinas` (ver `decisions.md`, ADR-0001) | `migrate_routines.py:575-648` | 🟡 |
| Recuperação de FK em duas estratégias com fallback e captura estruturada de `fk_specs`, não apenas texto de aviso (ver `decisions.md`, ADR-0002) | `migrate_routines.py:839-900` | 🟡 |
| `DEFAULT` real na coluna do destino aplicado junto com substituição em memória, não apenas uma das duas (ver `decisions.md`, ADR-0006) | `migrate_routines.py:975-991`, `:995` | 🟢 |
| `force_innodb` como opt-in explícito — `fix_table_engine_to_innodb` fica fora da lista estática `TABLE_TRANSFORMATIONS` | `migrate_routines.py:690`, `:699` | 🟢 |
| Cópia de dados em lotes fixos de 500, sem paralelismo — trade-off simplicidade/previsibilidade de memória sobre performance máxima | `migrate_routines.py:54`, `:995` | 🟡 |

## Estado Interno

Não há estado persistido entre execuções. Dentro de uma execução, o estado transiente é `table_results: list[dict]` e `pending_fks: list[dict]`, ambos acumulados em `main()` e descartados ao final (só sobrevivem via `report.json`/`migration.sql` se o operador confirmar salvar relatório). 🟢

## Observabilidade

- Saída interativa via `info/ok/warn/error` (terminal, `rich.Progress` para barra de progresso da cópia de dados, se disponível). 🟢
- `migration.sql` inclui cada `Issue` como comentário SQL acima do DDL correspondente, envolvido por `SET FOREIGN_KEY_CHECKS=0/1`. 🟢
- Falha isolada de `ALTER TABLE ... SET DEFAULT` numa coluna não gera `Issue` nem entra no `report.json`/`report.html` — só aparece no log de terminal (`warn()`). 🟡 Ver Riscos e Lacunas.

## Riscos e Lacunas

- 🟡 Falha de `ALTER TABLE ... SET DEFAULT` numa coluna individual não é capturada como `Issue` estruturada nem como campo de erro no dict de resultado — só um `warn()` de terminal, perdido se o operador não estiver acompanhando a execução ao vivo (ver `state-machines.md`, nota sobre `971bdf5`). **Decidido em revisão (2026-09-15, `../questions.md#pergunta-5`): a reimplementação deve gerar uma `Issue` de severidade `warning` (código `COLUMN_DEFAULT_FAILED`) para essa falha, visível em `report.json`/`report.html` — ver novo RF-10 em `requirements.md`.**
- 🔴 Não há forma de confirmar, sem acesso a um MySQL real, o comportamento exato de `find_referencing_fks`/`drop_referencing_fks` contra um schema com múltiplas FKs órfãs cruzadas (cenário de várias execuções anteriores incompletas) — o código assume que a segunda estratégia sempre resolve o bloqueio, mas não há teste automatizado que confirme isso para cadeias de referência mais profundas. Confirmado com o operador (2026-09-15, `../questions.md#pergunta-3`) que esse não é um cenário esperado em uso real — permanece 🔴, mas rebaixado de prioridade (não é mais um teste crítico para a reimplementação).
- 🟡 `resolve_pending_foreign_keys` não tenta novamente uma FK marcada `FK_NOT_RESTORED` — se o operador limpar as duplicatas na coluna referenciada depois, precisa restaurar a FK manualmente; o script não expõe um modo "retry restauração de FK" isolado. **Decidido em revisão (2026-09-15, `../questions.md#pergunta-4`): comportamento aceito como está — processo manual é suficiente, não é necessário um modo de retry dedicado na reimplementação.**
