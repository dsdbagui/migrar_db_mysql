# correcao-de-collation, Design Técnico

> Fonte: `fix_collation_stamp.py` (script inteiro, 477 linhas), `flowcharts/correcao-de-collation.md`, `data-dictionary.md`.

## Interface

Script CLI de execução única, sem argumentos de linha de comando (nenhum `argparse`/`sys.argv`). Toda entrada é via `.env` ou prompts interativos.

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `load_env` | `(path: Path = Path(".env"))` | `dict` | Não sobrescreve variáveis de ambiente do SO já definidas 🟢 |
| `connect` | `(host, port, user, password, database)` | `MySQLConnection \| None` | Sem retry — falha retorna `None` uma única vez 🟢 |
| `get_current_db_collation` | `(conn, database: str)` | `str` | `information_schema.SCHEMATA.DEFAULT_COLLATION_NAME` 🟢 |
| `find_stale_routines` | `(conn, database: str, old_collation: str)` | `list[dict]` | Rotinas com `DATABASE_COLLATION = old_collation` 🟢 |
| `get_ddl` | `(conn, database: str, name: str, rtype: str)` | `(str \| None, str \| None)` | DDL sem `DEFINER`, erro se falhar 🟢 |
| `recreate_routine` | `(conn, database: str, name: str, rtype: str)` | `(bool, str \| None, str \| None)` | `(sucesso, ddl_usado, erro)` 🟢 |
| `save_log` | `(results: list[dict], database: str, old_col: str, new_col: str)` | `Path` | Sempre cria o diretório, sem fallback de permissão 🟢 |

## Fluxo Principal

1. `load_env(Path(__file__).parent / ".env")` — se `.env` tem `DB_HOST`/`DB_USER`/`DB_PASSWORD`, usa esses valores direto; senão, pergunta host/port/user/senha/database interativamente (`fix_collation_stamp.py:339-361`). 🟢
2. `connect(...)` — se falhar, `sys.exit(1)` imediato, sem retry (`:363-365`). 🟢
3. `get_current_db_collation(conn, database)` — lê o collation atual do schema (`:368`). 🟢
4. **Guarda de segurança 1:** se `current_collation == OLD_COLLATION`, avisa que o banco precisa ser convertido primeiro (`ALTER DATABASE ... COLLATE ...`) e `sys.exit(1)` (`:374-378`). 🟢
5. `find_stale_routines(conn, database, OLD_COLLATION)` — busca procedures/functions com `DATABASE_COLLATION` ainda antigo (`:382`). Se vazio, `ok(...)` e `sys.exit(0)` (`:384-387`). 🟢
6. Lista as rotinas encontradas em tabela (rich) ou texto simples (`:394-407`). 🟢
7. `confirm(...)` — se recusado, `warn` e `sys.exit(0)` sem alterar nada (`:415-418`). 🟢
8. Para cada rotina: `recreate_routine(conn, database, name, type)` → `get_ddl` (SHOW CREATE + remove DEFINER via regex) → `DROP {rtype} IF EXISTS` → `USE {database}` → `CREATE` do DDL. Resultado acumulado em `results` (`:420-436`). 🟢
9. Resumo: total, OK, erro (`:438-450`). 🟢
10. **Verificação pós-execução:** se `n_ok > 0`, roda `find_stale_routines` de novo; lista o que ainda restar desatualizado, ou confirma que não há mais nenhum (`:452-460`). 🟢
11. `confirm("Salvar log em disco?")` — se sim, `save_log(...)` grava `log.json` + `recreated.sql` + `retry_errors.sql` (se houver erro) (`:463-469`). 🟢

## Fluxos Alternativos

- **`.env` ausente:** cai para prompts interativos de host/port/user/senha/database, com aviso (`warn(".env não encontrado...")`). 🟢
- **Banco ainda não convertido (collation atual == `OLD_COLLATION`):** aborta antes de tocar em qualquer rotina, com instrução de exemplo (`ALTER DATABASE ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`). 🟢
- **Nenhuma rotina desatualizada encontrada:** `ok("Nada a fazer")` e encerra com sucesso (`sys.exit(0)`), sem pedir confirmação. 🟢
- **Falha ao dropar uma rotina:** `recreate_routine` retorna `(False, ddl, erro)` sem tentar o `CREATE`; rotina marcada como erro no resumo. 🟢
- **Falha ao criar uma rotina (após DROP bem-sucedido):** `conn.rollback()`, retorna `(False, ddl, erro)` — a rotina fica **removida** do banco (DROP já commitado) até uma correção manual ou reprocessamento via `retry_errors.sql`. 🟡 Ver Riscos e Lacunas.
- **Rotinas remanescentes após a recriação (verificação pós-execução):** apenas `warn(...)` listando cada uma; o script não tenta novamente sozinho, nem oferece opção de retry automático nessa mesma execução. 🟢

## Dependências

- `mysql.connector` — única conexão MySQL (não há conceito de origem/destino como em `migrate_routines.py`; o script opera sobre um único banco). 🟢
- `rich` (opcional) — `HAS_RICH` controla degradação para `print`/`input` puro, mesmo padrão de `migrate_routines.py` mas com helpers duplicados localmente, não importados. 🟢
- `.env` (arquivo local, mesma pasta do script) — mecanismo de credencial próprio, diferente do `--config` JSON de `migrate_routines.py`. Ver ADR-0005. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Script independente, sem import cruzado com `migrate_routines.py`, apesar de duplicar helpers e a regex de remoção de `DEFINER` | `fix_collation_stamp.py` inteiro; ver `decisions.md` (ADR-0005) | 🟡 |
| Re-carimbo do collation é efeito colateral do `DROP`+`CREATE`, não uma instrução SQL direta — não existe `ALTER ROUTINE` para esse metadado no MySQL | `fix_collation_stamp.py:230-259` (comentário no código confirma) | 🟢 |
| `OLD_COLLATION` hardcoded como constante de módulo, não parametrizável | `fix_collation_stamp.py:57` | 🟢 |
| Guarda dupla (pré e pós-execução) usando a mesma query `find_stale_routines` | `fix_collation_stamp.py:165-186`, chamada em `:382` e `:454` | 🟢 |

## Estado Interno

Sem estado persistido entre execuções — cada rodada é independente, sem checkpoint/retomada. O único artefato que sobrevive à execução é o diretório de log opcional (`fix_collation_<database>_<timestamp>/`), que não é lido de volta pelo script em execuções futuras (diferente do padrão de retry automático de `migrate_routines.py`). 🟢

## Observabilidade

- Saída no terminal via `info`/`ok`/`warn`/`error`/`header`, mesmo padrão visual de `migrate_routines.py` mas implementado de forma independente (`fix_collation_stamp.py:89-117`). 🟢
- `log.json` — resumo estruturado (timestamp, database, collations antigo/novo, total/ok/erros, lista de rotinas com status). 🟢
- `recreated.sql` — todos os DDLs recriados, comentados com sucesso/falha por rotina, para auditoria. 🟢
- `retry_errors.sql` — apenas as rotinas que falharam, com DDL disponível, para reprocessamento manual. 🟢

## Riscos e Lacunas

- 🔴→🟢 Se `DROP` for bem-sucedido mas `CREATE` falhar, a rotina original fica removida do banco até correção manual — não há tentativa automática de restaurar o DDL original nem rollback do `DROP` (o `conn.rollback()` em `recreate_routine` ocorre após o `DROP` já ter sido commitado separadamente em `get_ddl`/fluxo anterior). **Decidido em revisão (2026-09-15, `../questions.md#pergunta-10`): esse risco NÃO é aceitável como está — a reimplementação deve adicionar uma salvaguarda (transação atômica de `DROP`+`CREATE`, ou backup do DDL original antes do `DROP` para restauração automática em caso de falha do `CREATE`). Vira requisito de segurança Must — ver `requirements.md`/`tasks.md`.**
- 🟡 `save_log` não tem fallback de diretório não-gravável (diferente de `save_report` em `relatorios-de-migracao`, que cai para o diretório temp do SO) — uma falha de permissão em `Path(...).mkdir()` provavelmente propaga como exceção não tratada, embora as rotinas já tenham sido recriadas com sucesso no banco a essa altura.
- 🟡 Duas ferramentas do mesmo projeto usam mecanismos de credencial diferentes (`.env` aqui vs `--config` JSON em `migrate_routines.py`) — pode confundir um operador que espera consistência. Ver ADR-0005.
