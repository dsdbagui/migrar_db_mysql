# Dicionário de Dados — migra_db_mysql

> Gerado pelo Archaeologist em 2026-09-02
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA
>
> Este projeto não tem modelos de domínio, ORM ou entidades persistidas próprias — os "dados" são estruturas Python (dicts/classe) que transportam metadados de rotinas/tabelas MySQL entre extração, transformação, aplicação e relatório. As tabelas abaixo documentam essas estruturas internas, não um schema de banco de dados aplicacional.

## Classe `Issue`

`migrate_routines.py:380` — representa um problema de compatibilidade detectado (e, às vezes, corrigido) numa transformação de DDL.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `code` | `str` | sim | Identificador estável do tipo de issue, ex: `DEFINER_REMOVED`, `SET_OPTION`, `ENGINE_TO_INNODB`, `FK_REMOVED`, `FK_RESTORED`, `FK_NOT_RESTORED` |
| `severity` | `str` | sim | Um de `"error"` (quebra no MySQL 8), `"warning"` (pode causar problema), `"info"` (mudança informativa) |
| `description` | `str` | sim | Texto legível em português explicando o problema/correção |
| `original` | `str` | sim | Trecho original do DDL (ou descrição textual do estado anterior) |
| `fixed` | `str` | sim | Trecho corrigido, ou `"(sem alteração automática)"` / `"(removido)"` quando não há correção automática |

🟢 Confirmado por leitura direta. Nota: o CLAUDE.md descreve `Issue` como "dataclass", mas na implementação é uma classe comum com `__init__` manual — funcionalmente equivalente, mas sem os recursos de `@dataclass` (ex: `__eq__`/`__repr__` automáticos).

**Códigos de issue conhecidos (por transformação):**

| Code | Severidade | Origem |
|---|---|---|
| `DEFINER_REMOVED` / `DEFINER_REPLACED` | info | `remove_definer` |
| `SET_OPTION` | error | `fix_set_option` |
| `OLD_PASSWORD` | error | `fix_old_password_hash` |
| `SQL_MODE_NO_AUTO_CREATE_USER` | error | `clean_sql_mode` |
| `ZERO_DATE` | warning | `fix_no_zero_date` |
| `GROUP_CONCAT` | warning | `fix_group_concat_maxlen` |
| `SQL_SECURITY_DEFINER` | warning | `fix_sql_security` |
| `CHARSET_INLINE` | warning | `fix_no_default_charset` |
| `ONLY_FULL_GROUP_BY` | warning | `fix_only_full_group_by` |
| `TYPE_TO_ENGINE` | error | `fix_table_type_keyword` |
| `UTF8_CHARSET` | warning | `fix_table_utf8` |
| `MYISAM_OPTIONS` | warning | `fix_table_myisam_options` |
| `ZEROFILL` | warning | `fix_table_zerofill` |
| `INT_DISPLAY_WIDTH` | info | `fix_table_int_display_width` |
| `ENGINE_TO_INNODB` | warning | `fix_table_engine_to_innodb` (opt-in) |
| `FK_REMOVED` | warning | `strip_foreign_keys` / `drop_referencing_fks` |
| `FK_RESTORED` | info | `resolve_pending_foreign_keys` (via `main()`) |
| `FK_NOT_RESTORED` | warning | `resolve_pending_foreign_keys` (via `main()`) |

---

## Rotina extraída (dict, retorno de `fetch_routines`)

`migrate_routines.py:320-334`

| Campo | Tipo | Obrigatório | Origem/Descrição |
|---|---|---|---|
| `name` | `str` | sim | `ROUTINE_NAME` |
| `type` | `str` | sim | `ROUTINE_TYPE` — `"PROCEDURE"` ou `"FUNCTION"` |
| `definer` | `str` | sim | `DEFINER` original (`` `user`@`host` ``) |
| `charset` | `str` | sim | `CHARACTER_SET_CLIENT` |
| `collation` | `str` | sim | `COLLATION_CONNECTION` |
| `db_collation` | `str` | sim | `DATABASE_COLLATION` — o "carimbo" que `correcao-de-collation` corrige |
| `sql_mode` | `str` | sim | `SQL_MODE` no momento da criação da rotina |
| `body_def` | `str \| None` | não | `ROUTINE_DEFINITION` — corpo bruto (raramente usado; o DDL completo vem de `ddl_original`) |
| `ddl_original` | `str \| None` | não | Resultado de `SHOW CREATE PROCEDURE/FUNCTION`, índice 2 (corpo completo) — `None` se a extração falhar |
| `extract_error` | `str` | não | Presente apenas se a extração do DDL falhar (ex: privilégio insuficiente) |

---

## Resultado de rotina (dict, `routine_results`)

`migrate_routines.py:1546-1557` — um item por rotina processada em `main()`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | `str` | sim | Nome da rotina |
| `type` | `str` | sim | `"PROCEDURE"` \| `"FUNCTION"` |
| `definer` | `str` | sim | Definer original (cópia do dict de extração) |
| `applied` | `bool` | sim | `True` se `apply_routine` teve sucesso |
| `skipped` | `bool` | sim | `True` se o DDL original estava indisponível |
| `issues` | `list[Issue]` | sim | Issues acumuladas por `transform_routine` |
| `ddl_original` | `str \| None` | sim | DDL bruto extraído |
| `ddl_fixed` | `str \| None` | sim | DDL após `transform_routine` + `normalize_delimiter` |
| `apply_error` | `str \| None` | sim | Mensagem de erro do MySQL, se `applied=False` e não `skipped` |
| `extract_error` | `str \| None` | sim | Copiado do dict de extração |

---

## Tabela extraída (dict, retorno de `fetch_tables`)

`migrate_routines.py:359-371`

| Campo | Tipo | Obrigatório | Origem/Descrição |
|---|---|---|---|
| `name` | `str` | sim | `TABLE_NAME` |
| `engine` | `str \| None` | não | `ENGINE` (`information_schema.TABLES`) |
| `approx_rows` | `int \| None` | não | `TABLE_ROWS` — estimativa do MySQL, não uma contagem exata |
| `collation` | `str` | sim | `TABLE_COLLATION` |
| `ddl_original` | `str \| None` | não | `SHOW CREATE TABLE`, índice 1 |
| `extract_error` | `str` | não | Presente apenas se a extração falhar |

---

## Resultado de tabela (dict, `table_results`)

`migrate_routines.py:1737-1751`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | `str` | sim | Nome da tabela |
| `engine` | `str \| None` | sim | Engine original |
| `approx_rows` | `int` | sim | `TABLE_ROWS` aproximado da origem |
| `mode` | `str` | sim | `"schema"` (apenas DDL) \| `"full"` (DDL + dados) |
| `applied` | `bool` | sim | `True` se o esquema foi criado (ou `skip_create=True`) |
| `skipped` | `bool` | sim | `True` se DDL indisponível |
| `issues` | `list[Issue]` | sim | Issues de `transform_table_ddl` + issues de recuperação de FK, se houver |
| `ddl_original` | `str \| None` | sim | DDL bruto |
| `ddl_fixed` | `str \| None` | sim | DDL após transformação (e, se aplicável, após remoção de FK na recuperação) |
| `apply_error` | `str \| None` | sim | Erro do `CREATE TABLE`, se falhou |
| `rows_copied` | `int` | sim | Total de linhas inseridas (0 se `mode="schema"`) |
| `copy_error` | `str \| None` | sim | Erro durante `copy_table_data`, se houver |
| `extract_error` | `str \| None` | sim | Copiado do dict de extração |

---

## `fk_specs` (dict — FK removida, candidata a restauração)

`migrate_routines.py:632-638` (criado por `strip_foreign_keys`) e `:744-751` (criado por `find_referencing_fks`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `fk_name` | `str` | sim | Nome da constraint (`CONSTRAINT \`fk_name\``) |
| `child_table` | `str` | sim | Tabela que declara a FK (a "filha") |
| `child_cols` | `list[str]` | sim | Colunas da tabela filha na FK |
| `ref_table` | `str` | sim | Tabela referenciada (a "pai") |
| `ref_cols` | `list[str]` | sim | Colunas referenciadas na tabela pai |
| `extra` | `str` | sim | `ON DELETE .../ON UPDATE ...` (vazio se ambos forem `RESTRICT`, o default) |

---

## `CONFIG` — schema do arquivo `--config` (JSON)

`migrate_routines.py:188-224` (`write_config_template`) — schema inferido do template gerado por `--init-config`; não há validação formal (sem JSON Schema, sem Pydantic).

| Chave (dotted path) | Tipo | Default no template | Descrição |
|---|---|---|---|
| `source.host` / `destination.host` | `str` | `"127.0.0.1"` | Host da conexão origem/destino |
| `source.port` / `destination.port` | `int` | `3306` / `3307` | Porta |
| `source.user` / `destination.user` | `str` | `"root"` | Usuário |
| `source.password` / `destination.password` | `str` | `""` | Senha |
| `source.database` / `destination.database` | `str` | `""` | Nome do banco |
| `migrate_routines` | `bool` | `true` | Migrar procedures/functions? |
| `migrate_tables` | `bool` | `true` | Migrar tabelas? |
| `new_definer` | `str \| null` | `null` | Novo DEFINER para rotinas (`null`/ausente = apenas remove) |
| `routines.select` | `"all" \| list[str]` | `"all"` | Nomes exatos das rotinas a migrar |
| `routines.drop_existing` | `bool` | `true` | Dropar rotina existente no destino antes de criar |
| `routines.apply` | `bool` | `true` | Confirma aplicação das rotinas selecionadas |
| `routines.view_compatibility_details` | `bool` | `false` | Exibir detalhes de issues no preview |
| `tables.select` | `"all" \| list[str]` | `"all"` | Nomes exatos das tabelas a migrar |
| `tables.copy_data` | `bool` | `false` | Copiar dados (`INSERT`) além do esquema |
| `tables.skip_create` | `bool` | `false` | Não recriar esquema — assume tabela já existe no destino |
| `tables.force_innodb` | `bool` | `true` | Forçar `ENGINE=InnoDB` |
| `tables.filters` | `dict[str,str]` | `{}` | Cláusula `WHERE` por nome de tabela (aplica só na cópia de dados) |
| `tables.drop_existing` | `bool` | `true` | Dropar tabela existente no destino antes de criar |
| `tables.apply` | `bool` | `true` | Confirma aplicação das tabelas selecionadas |
| `tables.view_compatibility_details` | `bool` | `false` | Exibir detalhes de issues no preview |
| `tables.restore_removed_fks` | `bool` | `true` | Tentar restaurar FKs removidas após carga de dados |
| `save_report` | `bool` | `true` | Salvar relatório em disco |
| `view_failed_routine_ddl` | `bool` | `false` | Exibir DDL corrigido de rotinas com erro ao final |

Qualquer chave ausente do JSON volta a ser perguntada interativamente (`cfg()` retorna `default`, que os wrappers `cfg_ask`/`cfg_confirm` tratam como "sem config, pergunte") 🟢.

---

## `report_data` — schema de `report.json`

`migrate_routines.py:1270-1318` — ver também feature `relatorios-de-migracao` em `code-analysis.md`.

| Campo | Tipo | Descrição |
|---|---|---|
| `timestamp` | `str` | `YYYYMMDD_HHMMSS` |
| `source_db` / `destination_db` | `str` | Nomes dos bancos origem/destino |
| `routines.total/applied/errors/skipped` | `int` | Contagens agregadas |
| `routines.items[]` | `list[dict]` | `{name, type, applied, skipped, apply_error, issues: [{code, severity, description}]}` |
| `tables.total/applied/errors/skipped/rows_copied` | `int` | Contagens agregadas |
| `tables.items[]` | `list[dict]` | `{name, engine, mode, applied, skipped, rows_copied, apply_error, copy_error, issues: [{code, severity, description}]}` |

Nota: `issues` aqui perde os campos `original`/`fixed` da classe `Issue` — a serialização mantém só `code/severity/description` 🟢.

---

## `fix_collation_stamp.py` — estruturas próprias (independentes)

### Rotina "stale" (dict, retorno de `find_stale_routines`)

`fix_collation_stamp.py:165-186`

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | `str` | `ROUTINE_NAME` |
| `type` | `str` | `"PROCEDURE"` \| `"FUNCTION"` |
| `charset_client` | `str \| None` | `CHARACTER_SET_CLIENT` |
| `collation_conn` | `str` | `COLLATION_CONNECTION` |
| `db_collation` | `str` | `DATABASE_COLLATION` (sempre igual a `OLD_COLLATION` neste resultado, por construção da query) |

### Resultado de recriação (dict, `results` em `main()`)

`fix_collation_stamp.py:426-432`

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | `str` | Nome da rotina |
| `type` | `str` | `"PROCEDURE"` \| `"FUNCTION"` |
| `success` | `bool` | `True` se `DROP`+`CREATE` teve sucesso |
| `ddl` | `str \| None` | DDL usado na recriação (sem `DEFINER`) |
| `error` | `str \| None` | Mensagem de erro, se `success=False` |

### `.env` (chaves lidas por `load_env`)

`fix_collation_stamp.py:14-18`

| Chave | Default se ausente |
|---|---|
| `DB_HOST` | `"127.0.0.1"` |
| `DB_PORT` | `"3306"` |
| `DB_USER` | `"root"` |
| `DB_PASSWORD` | `""` |
| `DB_NAME` | `"db_formosa"` |

Variáveis de ambiente do SO com o mesmo nome têm prioridade sobre o `.env` 🟢.

### `log.json` — schema de saída de `save_log`

`fix_collation_stamp.py:266-290`

| Campo | Tipo | Descrição |
|---|---|---|
| `timestamp` | `str` | `YYYYMMDD_HHMMSS` |
| `database` | `str` | Nome do banco processado |
| `old_collation` / `new_collation` | `str` | `OLD_COLLATION` fixo / collation atual detectado |
| `total/ok/errors` | `int` | Contagens |
| `routines[]` | `list[dict]` | `{name, type, success, error}` (sem o `ddl`, que só vai para `recreated.sql`) |
