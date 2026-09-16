# migracao-de-rotinas — Design Técnico

> Fonte: `code-analysis.md` (Feature: migracao-de-rotinas), `flowcharts/migracao-de-rotinas.md`, `data-dictionary.md`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Interface

Não há endpoints HTTP — interface é CLI interativa (ou `--config` JSON). Símbolos principais:

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `fetch_routines` | `(conn, database: str)` | `list[dict]` | Um dict por rotina, com `ddl_original` ou `extract_error` |
| `transform_routine` | `(ddl: str, new_definer: Optional[str] = None)` | `tuple[str, list[Issue]]` | DDL transformado + lista de issues acumuladas |
| `drop_if_exists` | `(conn, database: str, name: str, rtype: str)` | `None` | Engole qualquer exceção (idempotência silenciosa) |
| `apply_routine` | `(conn, database: str, ddl: str)` | `Optional[str]` | `None` = sucesso; string = mensagem de erro |

## Fluxo Principal

1. `fetch_routines(conn_src, src_db)` — consulta `information_schema.ROUTINES`, depois `SHOW CREATE PROCEDURE/FUNCTION` por rotina (`migrate_routines.py:345`). 🟢
2. Tabela com todas as rotinas é exibida ao operador. 🟢
3. `select_items()` resolve quais rotinas migrar (config `routines.select` ou prompt interativo). 🟢
4. Preview: `transform_routine` roda em modo preview (sem aplicar) sobre as rotinas selecionadas, para mostrar contagem de erros/avisos antes da confirmação. 🟢
5. Se o operador confirmar aplicação, decide `drop_existing`. 🟢
6. Para cada rotina selecionada: se `ddl_original` ausente → `skipped=true`; senão `transform_routine` → `normalize_delimiter` → `drop_if_exists` (se configurado) → `apply_routine`. 🟢
7. Resultado acumulado em `routine_results` (ver `data-dictionary.md`). 🟢

Ver diagrama completo em `../../_reversa_sdd/flowcharts/migracao-de-rotinas.md` (ou caminho equivalente relativo ao seu `output_folder`).

## Fluxos Alternativos

- **Rotina sem DDL extraído:** marcada `skipped=true` imediatamente, sem tentar transformar/aplicar; loop continua para a próxima. 🟢
- **`apply_routine` falha (`MySQLError`):** `rollback()` da transação; erro capturado como string e guardado em `apply_error`; rotina permanece não aplicada, mas a execução do lote continua. 🟢
- **`new_definer` não informado:** `remove_definer` apenas remove a cláusula `DEFINER=...`, sem substituir — o MySQL assume o usuário da conexão de destino como definer implícito na criação. 🟡

## Dependências

- **Connection Manager** (`connect`/`ask_connection`/`ensure_connected`) — fornece as conexões `conn_src`/`conn_dst` usadas por toda esta unit. Compartilhado com `migracao-de-tabelas`. 🟢
- **Config Resolver** (`cfg`/`cfg_ask`/`cfg_confirm`/`select_items`) — resolve `routines.*` via `--config` com fallback interativo. 🟢
- **Output Helpers** (`info/ok/warn/error/header`) — toda comunicação com o operador passa por esses helpers, nunca `print()` direto. 🟢
- **Report Generator** — consome `routine_results` ao final da execução para montar `report.json`/`report.html`/`migration.sql`. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Transformação de DDL via regex, não parser SQL/AST (ver `decisions.md`, ADR-0001) | `migrate_routines.py:434-543` | 🟡 |
| Pipeline declarativo — lista ordenada de funções puras `(ddl) -> (ddl, Issue\|None)` | `migrate_routines.py:543` (`TRANSFORMATIONS`) | 🟢 |
| Erro por item (rotina) isolado do lote — sem transação/rollback de lote inteiro | `migrate_routines.py:1544-1685` | 🟢 |

## Estado Interno

Não há estado persistido entre execuções para esta unit. Dentro de uma execução, o estado transiente é `routine_results: list[dict]`, acumulado em `main()` e descartado ao final (só sobrevive via `report.json`/`migration.sql` se o operador confirmar salvar relatório). 🟢

## Observabilidade

- Saída interativa via `info/ok/warn/error` (terminal, `rich` se disponível). 🟢
- `migration.sql` (gerado pelo Report Generator) inclui cada `Issue` como comentário SQL acima do DDL correspondente — é a trilha de auditoria mais detalhada disponível, já que `report.json` perde os campos `original`/`fixed` da `Issue`. 🟢
- Não há métricas/traces estruturados — apenas os artefatos de relatório ao final da execução. 🟢

## Riscos e Lacunas

- 🟡 `fix_only_full_group_by` usa `re.search(r"\bSELECT\b.*\*", ddl, re.DOTALL)`, que pode casar `SELECT`+`*` em contextos não relacionados dentro do mesmo corpo de rotina (ex: uma multiplicação `a * b` após um `SELECT` qualquer) — falso positivo possível, é só aviso, não bloqueia aplicação.
- 🟢 Mensagens de erro de privilégio insuficiente na extração/aplicação são corretamente capturadas como `extract_error`/`apply_error`, sem exceção não tratada — confirmado pelo operador em uso real (revisão de 2026-09-15, `questions.md#pergunta-1`), não apenas por inferência do código.
