# migracao-de-tabelas — Tarefas de Implementação

> Sequência executável para reimplementar esta unit a partir do legado (`migrate_routines.py`), com rastreabilidade.

## Pré-requisitos

- [ ] Connection Manager (`connect`/`ask_connection`/`ensure_connected`) disponível e testado
- [ ] Config Resolver (`cfg`/`cfg_ask`/`cfg_confirm`/`select_items`) disponível
- [ ] Output Helpers (`info/ok/warn/error/header`) disponíveis
- [ ] Classe `Issue` definida (severidade `error`/`warning`/`info`) — reaproveitada de `migracao-de-rotinas`

## Tarefas

- [ ] T-01, Implementar `fetch_tables(conn, database)` — consulta `information_schema.TABLES` (nome, engine, linhas aproximadas, collation) e `SHOW CREATE TABLE` por tabela; capturar erro individual em `extract_error` sem abortar o lote
  - Origem no legado: `migrate_routines.py:388`
  - Critério de pronto: rodando contra um banco com N tabelas (algumas sem privilégio de leitura), retorna lista de N dicts, com `extract_error` preenchido só nas que falharam
  - Confiança: 🟢

- [ ] T-02, Implementar as 5 transformações estáticas de `TABLE_TRANSFORMATIONS` (`fix_table_type_keyword`, `fix_table_utf8`, `fix_table_myisam_options`, `fix_table_zerofill`, `fix_table_int_display_width`) e `fix_table_engine_to_innodb` como função separada (opt-in)
  - Origem no legado: `migrate_routines.py:575-648`, `:690`
  - Critério de pronto: cada função, dado um DDL com o padrão correspondente, retorna `(ddl_talvez_modificado, Issue)` com o `code`/`severity` esperado; `fix_table_int_display_width` preserva `TINYINT(1)` explicitamente
  - Confiança: 🟢

- [ ] T-03, Implementar `transform_table_ddl(ddl, force_innodb=False)` — aplica `TABLE_TRANSFORMATIONS` em sequência, mais `fix_table_engine_to_innodb` se `force_innodb=True`
  - Origem no legado: `migrate_routines.py:699`
  - Critério de pronto: DDL com múltiplos padrões incompatíveis simultâneos produz uma `Issue` por padrão detectado; engine só muda para InnoDB quando a flag está ativa
  - Confiança: 🟢

- [ ] T-04, Implementar `strip_foreign_keys(ddl)` e `FK_CONSTRAINT_PATTERN` — remove cláusulas `CONSTRAINT ... FOREIGN KEY (...) REFERENCES ... (...) [ON DELETE/UPDATE ...]` do próprio DDL, retornando `fk_specs` estruturados das FKs removidas
  - Origem no legado: `migrate_routines.py:648-683`
  - Critério de pronto: DDL com 1+ FK própria, após `strip_foreign_keys`, não contém mais `FOREIGN KEY`; `fk_specs` retornado tem um item por FK removida, com `fk_name/child_table/child_cols/ref_table/ref_cols/extra`
  - Confiança: 🟢

- [ ] T-05, Implementar `find_referencing_fks(conn, database, table_name)` e `drop_referencing_fks(conn, database, table_name)` — localizam e removem FKs de outras tabelas que apontam para `table_name`, via `information_schema.KEY_COLUMN_USAGE`/`REFERENTIAL_CONSTRAINTS`
  - Origem no legado: `migrate_routines.py:761`, `:812`
  - Critério de pronto: contra um schema com uma FK órfã apontando para `table_name`, `find_referencing_fks` a encontra e `drop_referencing_fks` a remove com sucesso, retornando `fk_specs` + `Issue`
  - Confiança: 🟢

- [ ] T-06, Implementar `apply_table(conn, database, ddl)` — tenta `CREATE TABLE`; em erro 1215/6125, aplica as duas estratégias de recuperação em ordem (T-04, depois T-05) e tenta recriar
  - Origem no legado: `migrate_routines.py:839`
  - Critério de pronto: tabela com FK problemática (própria ou órfã de outra) é criada com sucesso após recuperação; erro que não é 1215/6125 é retornado sem tentar recuperação
  - Confiança: 🟢

- [ ] T-07, Implementar `_resolve_default_value(raw)`, `_sql_literal(value)` e o passo de `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` por coluna configurada, antes da cópia de dados
  - Origem no legado: `migrate_routines.py:984`, `:991`, `:1686-1995` (bloco de `column_defaults`)
  - Critério de pronto: coluna configurada com `"hoje"` recebe a data atual como `DEFAULT`; valor literal é escapado corretamente (aspas simples duplicadas); falha numa coluna não aborta as demais **e gera uma `Issue` de severidade `warning` (`COLUMN_DEFAULT_FAILED`) no resultado da tabela, visível no relatório final — divergência deliberada do legado, decidida em revisão (`../questions.md#pergunta-5`)**
  - Confiança: 🟢

- [ ] T-08, Implementar `copy_table_data(src_conn, dst_conn, src_db, dst_db, table, where=None, column_defaults=None)` — cópia em lotes de `BATCH_SIZE=500` via `fetchmany`/`executemany`, com `WHERE` opcional e substituição de `NULL` pelo valor configurado antes de cada `executemany`
  - Origem no legado: `migrate_routines.py:995`
  - Critério de pronto: tabela de origem com N linhas (algumas com NULL numa coluna configurada) é copiada integralmente para o destino, sem erro de `NOT NULL`, respeitando o filtro `WHERE` quando informado
  - Confiança: 🟢

- [ ] T-09, Implementar `resolve_pending_foreign_keys(conn, database, pending_fks)` — para cada FK pendente, checa duplicidade na coluna referenciada, cria `UNIQUE KEY` se limpa, e recria a `FOREIGN KEY`
  - Origem no legado: `migrate_routines.py:901`
  - Critério de pronto: FK pendente sem duplicata é restaurada (`FK_RESTORED`); FK pendente com duplicata fica `FK_NOT_RESTORED`, sem lançar exceção
  - Confiança: 🟢

- [ ] T-10, Implementar orquestração: extração → seleção → `copy_data`/`skip_create`/`force_innodb` → filtros `WHERE` e `column_defaults` por tabela → preview → `SET FOREIGN_KEY_CHECKS=0` → loop de aplicação (criação + `SET DEFAULT` + cópia) por tabela → restauração de FK pendente → `SET FOREIGN_KEY_CHECKS=1` → acumulação em `table_results`
  - Origem no legado: `migrate_routines.py:1686-1995`
  - Critério de pronto: execução ponta a ponta contra um par origem/destino de teste (incluindo pelo menos uma FK problemática e uma coluna com NULL) produz `table_results` coerente, com FK restaurada e dados copiados
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01, Teste do happy path: tabela sem FK problemática migra estrutura + dados com sucesso (ver `requirements.md`, Critérios de Aceitação)
- [ ] TT-02, Teste de recuperação de FK própria: tabela com FK que referencia coluna sem UNIQUE KEY é criada após `strip_foreign_keys`
- [ ] TT-03, Teste de recuperação de FK órfã: tabela bloqueada por FK de outra tabela (deixada por execução anterior) é criada após `drop_referencing_fks`
- [ ] TT-04, Teste de restauração de FK: coluna referenciada sem duplicata restaura a FK; coluna com duplicata não restaura, sem abortar a execução
- [ ] TT-05, Teste de `column_defaults`: linha com NULL na coluna configurada é inserida com o valor de fallback, e a coluna do destino fica com o `DEFAULT` setado
- [ ] TT-06, Teste de `skip_create=true`: nenhum `CREATE`/`DROP TABLE` é emitido, mas `SET DEFAULT` (se configurado) e cópia de dados ainda rodam
- [ ] TT-07, Teste de filtro `WHERE` por tabela: apenas as linhas que satisfazem a condição são copiadas
- [ ] TT-08, Teste de `force_innodb`: tabela `ENGINE=MyISAM` vira `ENGINE=InnoDB` só quando a flag está ativa

## Tarefas de Migração de Dados

- [ ] TM-01, Cópia de dados em lotes de 500 linhas, preservando a ordem de leitura da origem (`fetchmany`) — ver `design.md`, Fluxo Principal
- [ ] TM-02, Substituição de `NULL` por valor configurado, aplicada por linha antes de cada `executemany` — ver T-08

## Ordem Sugerida

1. T-01 (extração) e T-02/T-03 (transformações de DDL puras) podem ser feitas em paralelo — sem dependência entre si.
2. T-04 e T-05 (as duas estratégias de recuperação de FK) são independentes entre si, mas ambas precisam existir antes de T-06.
3. T-06 depende de T-04 e T-05 (compõe as duas estratégias em ordem).
4. T-07 e T-08 podem ser feitas em paralelo com T-04/T-05/T-06 — não têm dependência funcional entre si, mas T-08 precisa do Connection Manager pronto.
5. T-09 (restauração) depende de T-06 já estar produzindo `fk_specs` corretamente.
6. T-10 (orquestração) depende de todas as anteriores — é o passo de integração final.

## Lacunas Pendentes (🔴)

- Comportamento de `find_referencing_fks`/`drop_referencing_fks` contra cadeias de FK órfãs mais profundas (múltiplas execuções incompletas anteriores) não está confirmado contra um MySQL real. Confirmado com o operador (2026-09-15, `../questions.md#pergunta-3`) que não é um cenário esperado em uso real — teste de baixa prioridade, não bloqueante.

## Decisões de Revisão (2026-09-15)

- **Retry de FK `FK_NOT_RESTORED`:** decidido não expor um modo/comando separado de retry — processo manual (operador limpa duplicatas e roda os `ALTER`s à mão) é suficiente (`../questions.md#pergunta-4`). Não é uma tarefa da reimplementação.
- **T-07 (RF-10 novo):** falha de `ALTER TABLE ... SET DEFAULT` numa coluna deve gerar `Issue` de severidade `warning` (código `COLUMN_DEFAULT_FAILED`), visível em `report.json`/`report.html` — decisão confirmada em `../questions.md#pergunta-5`. Adicionar essa emissão de `Issue` à implementação de T-07, e o código novo à tabela de `data-dictionary.md`.
