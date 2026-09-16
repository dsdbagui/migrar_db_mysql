# Análise de Código — migra_db_mysql

> Gerado pelo Archaeologist em 2026-09-02
> Atualizado em 2026-09-15 pelo Reversa — reflete o commit `971bdf5` (2026-09-14): DEFAULT real em coluna de destino ao copiar dados com NULL, porta/sugestão de banco padrão do destino, auto-criação de banco no destino, e fallback de `save_report()` para o diretório temporário do SO. Números de linha revalidados contra o código atual.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão geral

O repositório é composto por **dois scripts Python CLI autocontidos** (sem framework de aplicação, sem pastas de domínio):

| Script | Linhas | Papel |
|---|---|---|
| `migrate_routines.py` | 2081 | Ferramenta principal — migra procedures/functions e tabelas de MySQL 5.x → 8.x |
| `fix_collation_stamp.py` | 477 | Ferramenta auxiliar independente — corrige o "carimbo" de `DATABASE_COLLATION` em rotinas após uma conversão de collation do banco |

Como não há módulos de domínio tradicionais, a organização das specs segue **features** (ver `.reversa/context/surface.json`), mapeadas às seções internas documentadas em `CLAUDE.md`:

1. `migracao-de-rotinas`
2. `migracao-de-tabelas`
3. `arquivo-de-configuracao`
4. `relatorios-de-migracao`
5. `correcao-de-collation`

Os três primeiros blocos (rotinas, tabelas, config) e o quarto (relatórios) vivem todos em `migrate_routines.py`, compartilhando infraestrutura comum: helpers de output (`info/ok/warn/error/header/ask/confirm`), conexão (`connect/ask_connection/ensure_connected`) e a classe `Issue`. A quinta feature é um script separado e não compartilha código com o principal (duplica seus próprios helpers de output e conexão, de forma independente — 🟢 confirmado por leitura direta, não há `import` cruzado entre os dois arquivos).

### Infraestrutura compartilhada (`migrate_routines.py`, usada por rotinas e tabelas)

| Item | Local | Descrição |
|---|---|---|
| `connect()` | `migrate_routines.py:248` | Wrapper de `mysql.connector.connect`; em erro 1115 (charset utf8mb4 não suportado — comum em MySQL 5.1/5.5 antigo) refaz a chamada com `charset="utf8"` automaticamente; **novo (`971bdf5`)** — em erro 1049 ("Unknown database") com `create_db_if_missing=True`, oferece (via `cfg_confirm("destination.create_database_if_missing", ...)`) criar o banco (`CREATE DATABASE IF NOT EXISTS ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`) usando uma conexão administrativa à parte (sem `database` no `connect()` inicial) e reconectar 🟢 |
| `ask_connection()` | `migrate_routines.py:297` | Pergunta host/port/user/senha/database (via `cfg_ask` se `cfg_prefix` informado), normaliza host removendo prefixo de URL (`re.sub(r'^\w+://', '', ...)`), tenta reconectar em loop recursivo se usuário confirmar; parâmetro `create_db_if_missing` (novo) é apenas repassado a `connect()` e propagado na recursão 🟢 |
| `ensure_connected()` | `migrate_routines.py:325` | Reconecta se `conn.is_connected()` for falso — chamado antes de blocos longos (migrações de tabelas com muitos dados podem deixar a conexão ociosa tempo suficiente para o servidor derrubá-la) 🟢 |

Chamada em `main()` (destino): `ask_connection("DESTINO (MySQL 8)", {"host": "127.0.0.1", "port": 3306, "database": src_params.get("database", "")}, cfg_prefix="destination", create_db_if_missing=True)` — porta padrão mudou de `3307` para `3306` e o campo `database` sugere o mesmo nome do banco de origem como default (usuário ainda pode digitar outro) 🟢.

---

## Feature: migracao-de-rotinas

**Arquivo:** `migrate_routines.py` — extração: `345-387`; transformações: `434-574`; aplicação: `717-746`; orquestração: `main()` `1544-1685`

### 1. Fluxo de controle

- **`fetch_routines(conn, database)`** (`:345`) — consulta `information_schema.ROUTINES` (nome, tipo, definer, charset, collation, sql_mode, corpo) e, para cada rotina, executa `SHOW CREATE PROCEDURE/FUNCTION` para obter o DDL completo. Em erro por rotina individual, captura a exceção e grava `extract_error` no dict em vez de abortar o lote inteiro 🟢.
- **`transform_routine(ddl, new_definer=None)`** (`:555`) — pipeline: aplica `remove_definer` primeiro, depois cada função da lista `TRANSFORMATIONS` em sequência, acumulando uma lista de `Issue`. Cada transformação é pura: recebe DDL, devolve `(ddl_talvez_modificado, Issue|None)` 🟢.
- **`drop_if_exists()`** (`:717`) — `DROP {rtype} IF EXISTS`, engolindo qualquer exceção (idempotência silenciosa) 🟢.
- **`apply_routine()`** (`:728`) — `USE <db>; <ddl>`; em `MySQLError`, faz `rollback()` e retorna a mensagem de erro como string (contrato: `None` = sucesso) 🟢.
- **Orquestração em `main()`** (`:1544-1685`): extrai → exibe tabela com todas as rotinas → `select_items()` resolve quais migrar → roda `transform_routine` em modo *preview* sobre as selecionadas (sem aplicar) para mostrar contagem de erros/avisos → se usuário confirmar aplicação, decide `drop_existing`, então para cada rotina selecionada: se DDL ausente marca `skipped`; senão transforma, normaliza delimitador, dropa (se configurado) e aplica, guardando o resultado num dict acumulado em `routine_results` 🟢. Não afetado pelo commit `971bdf5` (linhas apenas deslocadas pelas inserções em `connect`/`ask_connection` acima delas).

### 2. Algoritmos e lógica

Pipeline de transformação declarativo — lista ordenada `TRANSFORMATIONS` (`:543`), cada item uma função regex pura. Ordem importa apenas para legibilidade do preview (erros antes de avisos), não há dependência funcional entre as transformações:

| Ordem | Função | Severidade | O que detecta/corrige |
|---|---|---|---|
| (sempre 1ª, fora da lista) | `remove_definer` | info | Remove ou substitui `DEFINER=\`x\`@\`y\`` via regex `DEFINER\s*=\s*\`[^\`]*\`\s*@\s*\`[^\`]*\`\s*` |
| 1 | `fix_set_option` | error | `SET OPTION` (removido no MySQL 8) → `SET` |
| 2 | `fix_old_password_hash` | error | `OLD_PASSWORD()` (removido) — apenas avisa, sem correção automática |
| 3 | `clean_sql_mode` | error | Remove `NO_AUTO_CREATE_USER` do sql_mode |
| 4 | `fix_no_zero_date` | warning | Detecta literais `'0000-00-00'` — pode violar `NO_ZERO_DATE` |
| 5 | `fix_group_concat_maxlen` | warning | `GROUP_CONCAT(...)` sem limite — aviso sobre `group_concat_max_len` |
| 6 | `fix_sql_security` | warning | `SQL SECURITY DEFINER` — sugere `INVOKER`, sem alterar |
| 7 | `fix_no_default_charset` | warning | Remove `CHARACTER SET x [COLLATE y]` inline |
| 8 | `fix_only_full_group_by` | warning | Heurística: `SELECT *` (com `.` casando qualquer coisa via `DOTALL`) + `GROUP BY` no mesmo DDL → possível violação de `ONLY_FULL_GROUP_BY` |

🟡 A heurística de `fix_only_full_group_by` usa `re.search(r"\bSELECT\b.*\*", ddl, re.DOTALL)` — isso casa `SELECT` seguido de `*` em **qualquer lugar depois**, mesmo em statements não relacionados dentro do mesmo corpo (ex: multiplicação `a * b` após um `SELECT` qualquer), então pode gerar falsos positivos; é um alerta informativo, não bloqueia a aplicação.

`normalize_delimiter()` (`:538`) apenas `strip()` + remove `;` final — não lida com `DELIMITER $$` custom (o DDL vem de `SHOW CREATE`, que já retorna sem delimiter customizado).

### 3. Estruturas de dados

**`Issue`** (`:425`) — classe simples (não dataclass, apesar do CLAUDE.md descrevê-la como tal 🟡 — na prática é uma classe `__init__` manual com os mesmos campos):
```python
class Issue:
    code: str          # ex: "SET_OPTION", "DEFINER_REMOVED"
    severity: str       # "error" | "warning" | "info"
    description: str
    original: str
    fixed: str
```

**Dict de rotina** (retorno de `fetch_routines`): `name, type, definer, charset, collation, db_collation, sql_mode, body_def, ddl_original, extract_error?`

**Dict de resultado** (`routine_results`, construído em `main()` `:1546`): `name, type, definer, applied: bool, skipped: bool, issues: list[Issue], ddl_original, ddl_fixed, apply_error, extract_error`

Ver dicionário completo em `data-dictionary.md`.

### 4. Metadados e configurações

- Chaves de config (`--config`, ver feature `arquivo-de-configuracao`): `migrate_routines`, `new_definer`, `routines.select`, `routines.drop_existing`, `routines.apply`, `routines.view_compatibility_details`.
- `new_definer`: se `None`, DEFINER é apenas removido; se string (ex: `` `root`@`%` ``), substitui.

---

## Feature: migracao-de-tabelas

**Arquivo:** `migrate_routines.py` — extração: `388-424`; transformações: `575-716`; aplicação/recuperação de FK/cópia de dados: `747-1076`; orquestração: `main()` `1686-1995`

### 1. Fluxo de controle

- **`fetch_tables()`** (`:388`) — `information_schema.TABLES` (nome, engine, linhas aproximadas, collation) + `SHOW CREATE TABLE` por tabela; mesmo padrão de captura de erro individual que `fetch_routines` 🟢.
- **`transform_table_ddl(ddl, force_innodb=False)`** (`:699`) — roda `TABLE_TRANSFORMATIONS` (lista estática) e, se `force_innodb`, adicionalmente `fix_table_engine_to_innodb` (fora da lista estática — opt-in explícito) 🟢.
- **`apply_table()`** (`:839`) — cria a tabela; se falhar com erro MySQL 1215/6125 ("Cannot add foreign key constraint"/falta de unique key), tenta **duas estratégias de recuperação em ordem**:
  1. Se a própria tabela declara a FK problemática → `strip_foreign_keys()` remove as constraints FK do próprio DDL e tenta recriar.
  2. Se ainda falhar (ou não havia FK própria), busca FKs de **outras tabelas** que referenciam esta (`find_referencing_fks`, via `information_schema.KEY_COLUMN_USAGE`/`REFERENTIAL_CONSTRAINTS`) — cenário de FK "órfã" deixada por execução anterior do script — e as remove (`drop_referencing_fks`) antes de tentar recriar novamente.
  Retorna `(erro|None, ddl_efetivamente_aplicado, issues_extras, fk_specs_removidas)` 🟢.
- **`copy_table_data()`** (`:995`) — copia em lotes de `BATCH_SIZE=500` via `fetchmany`/`executemany`, com `WHERE` opcional por tabela; commit por lote; barra de progresso via `rich.Progress` (spinner) se disponível, senão `print` com `\r` 🟢. **Novo (`971bdf5`)** — parâmetro `column_defaults: Optional[dict[str, str]]`: antes de cada `executemany`, `apply_defaults(batch)` (closure interna) substitui `None` por um valor fixo nas colunas indicadas, usando as posições pré-calculadas em `default_positions` (resolvidas uma vez fora do loop de lotes, não a cada linha) 🟢.
- **`_resolve_default_value(raw)`** (`:984`, novo em `971bdf5`) — `"hoje"`/`"today"` (case-insensitive) vira `date.today().isoformat()`; qualquer outro valor é devolvido literal.
- **`_sql_literal(value)`** (`:991`, novo em `971bdf5`) — escapa aspas simples dobrando-as (`'` → `''`) e envolve em aspas simples, para uso direto em `ALTER TABLE ... SET DEFAULT <literal>` (não usa parâmetro bind porque `SET DEFAULT` não aceita placeholder do driver) 🟢.
- **`resolve_pending_foreign_keys()`** (`:901`) — chamado **após** todas as tabelas serem criadas e os dados copiados: para cada FK removida durante `apply_table`, verifica se a coluna referenciada no pai tem valores duplicados (`GROUP BY ... HAVING COUNT(*) > 1`); se não houver duplicata, cria `UNIQUE KEY` na coluna referenciada e então recria a `FOREIGN KEY` original — seguro porque `FOREIGN_KEY_CHECKS=0` está ativo durante toda a migração de tabelas, então linhas órfãs pré-existentes não bloqueiam a constraint 🟢.
- **Orquestração em `main()`** (`:1686-1995`): extrai → exibe tabela → `select_items()` → pergunta modo (`copy_data`: schema-only vs schema+dados) → pergunta `skip_create` (tabelas já existem no destino, só inserir dados) → se não `skip_create`, pergunta `force_innodb` → se `copy_data`, pergunta filtros `WHERE` por tabela → **novo (`971bdf5`)**: se `copy_data`, resolve `table_column_defaults` — via `cfg("tables.column_defaults")` se configurado (aplica `_resolve_default_value` a cada valor), senão pergunta interativamente por tabela selecionada (loop de "coluna com valor padrão" até Enter vazio) se o usuário confirmar que quer definir defaults (`default=False` — opt-in) → preview de compatibilidade → aplicação: `SET FOREIGN_KEY_CHECKS=0` uma vez antes do loop, reconecta (`ensure_connected`) a cada iteração, cria/pula esquema → **novo**: se a tabela tem `column_defaults` configurados e a criação foi aplicada, roda `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT <literal>` por coluna (cada uma em `try/except MySQLError` isolado — falha numa coluna não aborta as demais nem a tabela), registrando `Issue("COLUMN_DEFAULT_SET", "info", ...)` em caso de sucesso → copia dados se aplicável (passando `column_defaults=col_defaults` a `copy_table_data`), acumula `pending_fks` → após o loop, se houver `pending_fks`, pergunta se restaura (`resolve_pending_foreign_keys`) → `SET FOREIGN_KEY_CHECKS=1` no final 🟢.

### 2. Algoritmos e lógica

**`TABLE_TRANSFORMATIONS`** (`:690`, sempre aplicadas) + `fix_table_engine_to_innodb` (opt-in via `force_innodb`):

| Função | Severidade | O que faz |
|---|---|---|
| `fix_table_type_keyword` | error | `TYPE=Engine` (sintaxe MySQL 4.x) → `ENGINE=Engine` |
| `fix_table_utf8` | warning | `utf8_*` → `utf8mb4_*` (collations primeiro, depois o charset — ordem importa para não corromper `utf8mb4` já presente); usa negative lookahead `\butf8\b(?!mb)` |
| `fix_table_myisam_options` | warning | Remove `PACK_KEYS=N`, `DELAY_KEY_WRITE=N`, `CHECKSUM=N` (exclusivas do MyISAM) |
| `fix_table_zerofill` | warning | Detecta `ZEROFILL` (deprecado 8.0.17+), sem remoção automática |
| `fix_table_int_display_width` | info | Remove display width de `SMALLINT/MEDIUMINT/BIGINT/INT(N)` — **preserva `TINYINT(1)`** deliberadamente (convenção de booleano em ORMs) |
| `fix_table_engine_to_innodb` (opt-in) | warning | Qualquer `ENGINE=X` (X ≠ InnoDB) → `ENGINE=InnoDB` |

**Estratégia de recuperação de FK — algoritmo em `apply_table`** (🟢 núcleo de negócio mais complexo do projeto):
```
tentar CREATE TABLE
  se sucesso → retorna
  se erro NÃO é 1215/6125 → retorna erro (não tenta recuperação)
  senão:
    extrai table_name do próprio DDL via regex
    se DDL contém "FOREIGN KEY":
      remove as FKs do próprio DDL (strip_foreign_keys) e tenta recriar
      se sucesso → retorna (com fk_specs das FKs removidas)
    se ainda não criou e temos table_name:
      busca FKs de OUTRAS tabelas apontando para table_name (find_referencing_fks)
      remove essas FKs órfãs (drop_referencing_fks) e tenta recriar de novo
      se sucesso → retorna (com fk_specs acumuladas das duas estratégias)
    se nada funcionou → retorna o último erro capturado
```

**Algoritmo de restauração de FK — `resolve_pending_foreign_keys`**:
```
para cada FK removida:
  SELECT colunas_referenciadas FROM tabela_pai
    WHERE colunas IS NOT NULL GROUP BY colunas HAVING COUNT(*) > 1 LIMIT 1
  se encontrou duplicata → não restaura (inseguro criar UNIQUE KEY)
  senão:
    ALTER TABLE pai ADD UNIQUE KEY uk_<tabela>_<colunas> (...)   # nome truncado em 64 chars
    ALTER TABLE filha ADD CONSTRAINT <fk_name> FOREIGN KEY (...) REFERENCES pai (...) <extra>
```
`extra` carrega `ON DELETE`/`ON UPDATE` só quando a regra original **não** é `RESTRICT` (default do MySQL, omitido por brevidade).

### 3. Estruturas de dados

**`fk_specs`** (dict passado entre `strip_foreign_keys`/`find_referencing_fks` → `apply_table` → `resolve_pending_foreign_keys`): `fk_name, child_table, child_cols: list[str], ref_table, ref_cols: list[str], extra`

**Dict de resultado** (`table_results`, construído em `main()`): `name, engine, approx_rows, mode ("schema"|"full"), applied, skipped, issues: list[Issue], ddl_original, ddl_fixed, apply_error, rows_copied, copy_error, extract_error` — sem novos campos no dict em si; o `Issue("COLUMN_DEFAULT_SET", ...)` de `971bdf5` entra na lista `issues` existente.

**`table_column_defaults: dict[str, dict[str, str]]`** (novo em `971bdf5`, local a `main()`) — `{nome_tabela: {nome_coluna: valor_resolvido}}`; alimenta tanto o `ALTER TABLE ... SET DEFAULT` quanto o `column_defaults` passado a `copy_table_data`.

**`FK_CONSTRAINT_PATTERN`** (`:648`) — regex única que captura toda a cláusula `, CONSTRAINT \`x\` FOREIGN KEY (...) REFERENCES \`y\` (...) [ON DELETE/UPDATE ...]` de um `CREATE TABLE` — usada tanto para remover quanto para parsear os specs.

**`FK_ERROR_CODES = {1215, 6125}`** (`:758`) — 1215 é o código clássico do protocolo MySQL, 6125 é o código de erro específico do MySQL 8 para "Failed to add the foreign key constraint. Missing unique key...".

### 4. Metadados e configurações

Chaves de config: `migrate_tables`, `tables.select`, `tables.copy_data`, `tables.skip_create`, `tables.force_innodb`, `tables.filters` (dict tabela→WHERE), `tables.column_defaults` (dict tabela→coluna→valor, novo em `971bdf5` — `"hoje"`/`"today"` vira data atual), `tables.drop_existing`, `tables.apply`, `tables.view_compatibility_details`, `tables.restore_removed_fks`.

`BATCH_SIZE = 500` (`:54`) — constante de módulo, não configurável via CLI/config atualmente 🟢.

---

## Feature: arquivo-de-configuracao

**Arquivo:** `migrate_routines.py:55-247`

### 1. Fluxo de controle

Camada de indireção sobre os helpers interativos `ask`/`confirm`, permitindo pular perguntas quando a resposta já está num JSON carregado via `--config`:

- **`load_config(path)`** (`:118`) — lê e faz parse do JSON; `sys.exit(1)` em arquivo ausente ou JSON inválido (falha rápida, sem fallback silencioso) 🟢.
- **`cfg(key, default=None)`** (`:132`) — navega o dict `CONFIG` por um caminho com pontos (ex: `"tables.force_innodb"`), retornando `default` se qualquer segmento do caminho não existir ou não for dict 🟢.
- **`cfg_ask`/`cfg_confirm`** (`:143`, `:151`) — se `cfg(key)` não for `None`, informa o valor encontrado (mascarando senha com `••••••`) e retorna sem perguntar; senão delega a `ask`/`confirm` normalmente. **Wrappers drop-in**: mesma assinatura de `ask`/`confirm` mais o parâmetro `key` na frente.
- **`select_items(items, cfg_key, label)`** (`:159`) — substitui o padrão "migrar todas?/números separados por vírgula": via config aceita `"all"` (todos os índices) ou uma lista de **nomes exatos** (não índices — índices mudariam entre execuções conforme o schema evolui); nomes não encontrados na origem geram `warn` mas não abortam. Sem config, cai no fluxo interativo original (índices 1-based, `part.isdigit()` filtra entradas inválidas silenciosamente).
- **`write_config_template(path)`** (`:189`) — usado por `--init-config`; serializa um dict fixo com todas as chaves documentadas, incluindo `_comment_*` como texto explicativo embutido nos próprios valores JSON (não é JSON5/JSONC — os comentários são chaves reais tipo `_comment_select`) 🟢. **Alterado em `971bdf5`**: `destination` no template agora traz `port: 3306` (era 3307), mais `create_database_if_missing: true` com seu próprio `_comment_create_database_if_missing`; `tables` ganhou a chave `column_defaults: {}` com `_comment_column_defaults` explicando a sintaxe (`{"tabela1": {"coluna1": "hoje"}}`).

### 2. Algoritmos e lógica

Nenhum algoritmo não-trivial — é um sistema de *lookup* com fallback. A única lógica de negócio real é em `select_items`: resolução de nomes → índices com tratamento de "não encontrado" via diferença de conjuntos (`wanted - {nomes_encontrados}`).

### 3. Estruturas de dados

`CONFIG: dict` — módulo-level, populado uma vez em `if __name__ == "__main__"` (`:2062`) antes de chamar `main()`. Estrutura esperada documentada implicitamente pelo template gerado em `write_config_template` — ver `data-dictionary.md` para o schema completo.

### 4. Metadados e configurações

Esta é a própria feature de metadados/configuração — não se aplica um nível adicional. Nota de projeto: **não há validação de schema** no JSON carregado por `load_config` além do parse — uma chave grafada errado (ex: `tables.forceinnodb` em vez de `tables.force_innodb`) simplesmente não é encontrada por `cfg()` e a pergunta correspondente volta a ser interativa, silenciosamente 🟡 (comportamento inferido do código, não há teste ou log que confirme isso é intencional vs. lacuna).

---

## Feature: relatorios-de-migracao

**Arquivo:** `migrate_routines.py:1077-1498`

### 1. Fluxo de controle

- **`print_summary_table()` / `print_table_summary()`** (`:1077`, `:1115`) — impressão no terminal (rich `Table` ou fallback texto simples) dos resultados de rotinas/tabelas, chamadas ao final de `main()`.
- **`render_html_report(data)`** (`:1168`) — gera uma string HTML **autocontida** (CSS inline, um `<script>` inline para filtro por texto, sem dependências externas — abre via `file://`) a partir do mesmo dict que vira `report.json`. Funções internas: `esc()` (escapa HTML via `html.escape`), `status_badge()`, `issues_cell()` (agrupa por severidade com contadores E/A/I — nota: usa "A" para warning/aviso, não "W", seguindo a nomenclatura em português), `error_cell()`, `table_rows()`/`routine_rows()` (monta `<tr>` por item, com `data-name` em lowercase para o filtro JS de busca) 🟢.
- **`save_report()`** (`:1338`) — orquestra a escrita de todos os artefatos de saída num diretório `migration_report_<timestamp>/`:
  - `report.json` — dict estruturado com totais + itens (issues serializados como dict simples, não a instância `Issue`)
  - `report.html` — saída de `render_html_report`
  - `migration.sql` — todos os DDLs corrigidos (tabelas primeiro, depois rotinas), com `SET FOREIGN_KEY_CHECKS=0/1` envolvendo o arquivo inteiro e cada issue anotado como comentário SQL acima do DDL correspondente
  - `retry_routines.sql` (condicional — só se houver rotina com erro e `ddl_fixed` disponível)
  - `retry_tables.sql` (condicional, mesma lógica; inclui `DROP TABLE IF EXISTS` antes de cada `CREATE`)

  **Alterado em `971bdf5`** — assinatura agora retorna `Optional[Path]` (antes sempre `Path`). `report_dir.mkdir(exist_ok=True)` está em `try/except OSError`: se falhar (ex.: `PermissionError` no diretório de trabalho atual), cai para `Path(tempfile.gettempdir()) / report_dir.name` com `warn()`; se **esse** também falhar, `error()` + `warn()` e retorna `None` sem levantar exceção — a migração já aplicada não é desfeita nem afetada, só o relatório fica indisponível. O chamador em `main()` (`:2030`, bloco `# ── Relatório ──`) precisa checar `report_dir is not None` antes de imprimir os caminhos dos arquivos gerados 🟢.

### 2. Algoritmos e lógica

Não há algoritmo não-trivial — é geração de relatório por template string (f-strings) e agregação (`sum`/`sum(1 for ...)`) sobre as listas de resultados. Ponto de atenção: `render_html_report` e `save_report` fazem a **mesma agregação de totais duas vezes** de forma independente (uma vez para os `cards` do HTML dentro de `report_data` construído em `save_report`, reaproveitada por `render_html_report` — na verdade é uma única fonte, `report_data`, passada para `render_html_report`; não há duplicação real, apenas duas funções consumindo o mesmo dict) 🟢.

### 3. Estruturas de dados

`report_data` (dict serializado em `report.json`, construído em `save_report:1362`):
```
{
  timestamp, source_db, destination_db,
  routines: { total, applied, errors, skipped, items: [{name, type, applied, skipped, apply_error, issues: [{code, severity, description}]}] },
  tables:   { total, applied, errors, skipped, rows_copied, items: [{name, engine, mode, applied, skipped, rows_copied, apply_error, copy_error, issues: [...]}] }
}
```
Note que `issues` aqui é uma lista de **dicts simples** (`code/severity/description`), não as instâncias `Issue` originais — perde os campos `original`/`fixed` nesta serialização (eles só existem em `migration.sql`, como comentário formatado inline, não estruturado) 🟢.

### 4. Metadados e configurações

Chave de config: `save_report` (bool). `view_failed_routine_ddl` (bool) controla se o DDL corrigido de rotinas com erro é impresso interativamente no terminal ao final — não afeta os arquivos salvos.

---

## Feature: correcao-de-collation

**Arquivo:** `fix_collation_stamp.py` (script inteiro, independente de `migrate_routines.py`)

### 1. Fluxo de controle

Script standalone de manutenção pós-migração, para um cenário específico: depois que o schema já foi convertido para um novo collation (ex: `utf8mb4_0900_ai_ci`, o padrão do MySQL 8), rotinas armazenadas continuam com o `DATABASE_COLLATION` "carimbado" no momento em que foram criadas — esse carimbo só é atualizado quando a rotina é recriada (`DROP` + `CREATE`).

- **`load_env(path=Path(".env"))`** (`:64`) — parser de `.env` manual (sem biblioteca `python-dotenv`): ignora linhas vazias/comentário, faz `partition("=")`, remove aspas do valor; variáveis já definidas no SO **têm prioridade** sobre o arquivo (`os.environ.get(key, value)`) 🟢.
- **`main()`** (`:328`): carrega `.env` (se ausente, cai para prompts interativos) → conecta → `get_current_db_collation()` lê `information_schema.SCHEMATA.DEFAULT_COLLATION_NAME` → **guarda de segurança**: se o collation atual do banco ainda for `OLD_COLLATION`, aborta com instrução para o usuário converter o banco primeiro (`ALTER DATABASE ... CHARACTER SET utf8mb4 COLLATE ...`) → `find_stale_routines()` lista rotinas cujo `DATABASE_COLLATION` (carimbado) ainda é o antigo → confirmação → loop `recreate_routine()` por rotina → resumo → **verificação pós-execução**: roda `find_stale_routines` de novo para confirmar que nada ficou desatualizado → oferece salvar log 🟢.
- **`recreate_routine()`** (`:230`) — `get_ddl()` busca o DDL via `SHOW CREATE`, removendo o `DEFINER` inline (regex idêntica à de `migrate_routines.py`, mas duplicada localmente, não importada); depois `DROP {rtype} IF EXISTS` + `CREATE` do mesmo DDL no **mesmo banco** — é o `DROP`+`CREATE` em si que faz o MySQL re-carimbar o `DATABASE_COLLATION` corrente automaticamente (não há comando SQL direto para alterar esse metadado de uma rotina existente) 🟢.

### 2. Algoritmos e lógica

Não há transformação de DDL além da remoção do `DEFINER` — o script **não** aplica nenhuma das correções de `migrate_routines.py` (não roda `TRANSFORMATIONS`), porque seu propósito é apenas re-carimbar o collation de rotinas que presumivelmente já foram migradas/validadas antes. 🟡 Ponto de atenção: como consequência, se uma rotina tiver algum problema de compatibilidade MySQL 8 não corrigido anteriormente, `recreate_routine` vai falhar ao tentar recriá-la (capturado como erro por rotina, não aborta o lote).

Guarda de segurança dupla: (1) recusa rodar se o banco **ainda não foi convertido** (checagem antes do loop), (2) verificação **pós-execução** relista rotinas com collation antigo para confirmar que a operação teve efeito — mesma query (`find_stale_routines`) usada nos dois pontos.

### 3. Estruturas de dados

Dict de rotina "stale" (retorno de `find_stale_routines`): `name, type, charset_client, collation_conn, db_collation`

Dict de resultado (`results`, em `main()` `:426`): `name, type, success: bool, ddl: Optional[str], error: Optional[str]`

`OLD_COLLATION = "utf8mb4_unicode_ci"` (`:57`) — constante fixa no módulo; **não configurável** via `.env` ou argumento CLI — para migrar de/para outros collations o valor precisa ser editado no código-fonte 🟢.

### 4. Metadados e configurações

Credenciais via `.env` na mesma pasta do script (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) — **não** reutiliza o `--config`/`CONFIG` de `migrate_routines.py` (são scripts independentes, sem import cruzado). Sem flag `--dry-run`; a única salvaguarda antes de executar é a confirmação interativa (`confirm(...)`) e a checagem de collation do banco.

## Saída — resumo para o Reversa

- **Módulos/features analisados:** 5 (`migracao-de-rotinas`, `migracao-de-tabelas`, `arquivo-de-configuracao`, `relatorios-de-migracao`, `correcao-de-collation`)
- **Principais algoritmos:** pipeline de transformação de DDL por regex (rotinas e tabelas), recuperação de FK em duas estratégias com retry (`apply_table`), restauração de FK pós-carga com checagem de duplicidade (`resolve_pending_foreign_keys`), resolução de config com fallback dotted-path (`cfg`/`cfg_ask`/`cfg_confirm`), substituição de `NULL` por `DEFAULT` real na coluna de destino antes do `INSERT` (`971bdf5` — `column_defaults`/`_resolve_default_value`/`apply_defaults` em `copy_table_data`), auto-criação do banco de destino em erro 1049 (`connect`), fallback de `save_report()` para o diretório temporário do SO em `PermissionError`
- **Entidades de dados (dicts estruturados, não há ORM/classes de domínio):** `Issue`, dict de rotina extraída, dict de resultado de rotina, dict de tabela extraída, dict de resultado de tabela, `fk_specs`, `report_data`, dict de config (`CONFIG`)
