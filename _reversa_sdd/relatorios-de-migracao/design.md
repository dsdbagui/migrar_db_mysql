# relatorios-de-migracao — Design Técnico

> Fonte: `code-analysis.md` (Feature: relatorios-de-migracao), `flowcharts/relatorios-de-migracao.md`, `data-dictionary.md` (schema `report_data`).
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Interface

Não há endpoints HTTP — interface é a saída de terminal + arquivos gravados em disco. Símbolos principais:

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `print_summary_table` | `(results: list[dict])` | `None` | Resumo de rotinas no terminal (rich `Table` ou fallback texto) |
| `print_table_summary` | `(table_results: list[dict])` | `None` | Resumo de tabelas no terminal |
| `render_html_report` | `(data: dict)` | `str` | HTML autocontido a partir de `report_data` |
| `save_report` | `(routine_results, src_db, dst_db, table_results, ...)` | `Optional[Path]` | Orquestra a escrita de todos os artefatos; `None` se nem o diretório de trabalho nem o temp dir forem graváveis |

## Fluxo Principal

1. Ao final do processamento de rotinas e tabelas em `main()`, `print_summary_table`/`print_table_summary` exibem o resumo no terminal. 🟢
2. Se o operador confirma salvar relatório (`save_report` config key), `save_report(routine_results, src_db, dst_db, table_results)` é chamado. 🟢
3. `report_dir.mkdir(exist_ok=True)` é tentado no diretório de trabalho atual, dentro de `try/except OSError`. Se falhar (ex: `PermissionError`), cai para `Path(tempfile.gettempdir()) / report_dir.name`; se isso também falhar, `error()` + `warn()` e retorna `None`. 🟢
4. Com diretório disponível, monta `report_data` (totais + items de rotinas e tabelas). 🟢
5. Escreve `report.json` (serialização direta de `report_data`). 🟢
6. Chama `render_html_report(report_data)` e escreve o resultado em `report.html`. 🟢
7. Monta `migration.sql`: DDLs corrigidos (tabelas primeiro, depois rotinas), cada issue como comentário SQL acima do DDL correspondente, tudo envolvido em `SET FOREIGN_KEY_CHECKS=0/1`. 🟢
8. Se há rotina com erro e `ddl_fixed` disponível, escreve `retry_routines.sql`. Mesma lógica para `retry_tables.sql` (que também inclui `DROP TABLE IF EXISTS` antes de cada `CREATE`). 🟢
9. Retorna `report_dir` (ou `None`). `main()` checa `report_dir is not None` antes de imprimir os caminhos dos arquivos gerados. 🟢

Ver diagrama completo em `../flowcharts/relatorios-de-migracao.md`.

## Fluxos Alternativos

- **Diretório de trabalho não gravável:** fallback para `tempfile.gettempdir()`, com `warn()` informando a mudança de local. 🟢
- **Nenhum diretório gravável (trabalho atual nem temp do SO):** `save_report` retorna `None` sem lançar exceção; a migração já aplicada não é desfeita nem afetada, só o relatório fica indisponível. 🟢
- **Sem erros em rotinas/tabelas:** `retry_routines.sql`/`retry_tables.sql` não são gerados — apenas os 3 artefatos principais. 🟢
- **Operador não confirma salvar relatório:** nenhum arquivo é gerado, apenas o resumo de terminal já exibido antes da pergunta. 🟢

## Dependências

- **Resultados de `migracao-de-rotinas`** (`routine_results`) e **`migracao-de-tabelas`** (`table_results`) — únicas fontes de dados desta unit; não há consulta adicional ao banco. 🟢
- **`Issue`** — reaproveitada de ambas as units de migração; serializada como dict simples (`code/severity/description`) em `report.json`, perdendo `original`/`fixed`. 🟢
- **Output Helpers** (`info/ok/warn/error`) — comunicação de progresso/erro ao operador durante a geração. 🟢
- Nenhuma dependência de biblioteca externa para `report.html` — CSS e JavaScript de filtro são inline, gerados por f-string. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Três formatos gerados a partir da mesma fonte (`report_data`), sem template engine compartilhado (ver `decisions.md`, ADR-0004) | `migrate_routines.py:1168`, `:1338` | 🟡 |
| HTML autocontido — CSS/JS inline, sem CDN, sem build step, aberto via `file://` | `migrate_routines.py:1168` (`render_html_report`) | 🟢 |
| Degradação em cascata para salvar relatório (diretório atual → temp do SO → desistir sem crash), introduzida em `971bdf5` | `migrate_routines.py:1338-1498` | 🟢 |
| `retry_tables.sql` inclui `DROP TABLE IF EXISTS` (idempotência de retry), `retry_routines.sql` não precisa (já usa `DROP ... IF EXISTS` opcional no fluxo normal) | `migrate_routines.py:1338-1498` | 🟢 |

## Estado Interno

Não há estado persistido entre execuções por esta unit especificamente — cada chamada de `save_report` é independente, criando um novo diretório `migration_report_<timestamp>/`. O estado transiente (`report_data`) é construído e descartado dentro da própria chamada. 🟢

## Observabilidade

- Esta unit **é** a observabilidade do projeto — não há métricas/traces estruturados fora dela; os 3 arquivos gerados (mais o resumo de terminal) são o único rastro de auditoria da execução. 🟢
- Falha ao salvar relatório é comunicada via `warn()`/`error()` no terminal — não há log persistido separado do próprio relatório que falhou ao ser salvo (se o relatório não pode ser salvo, não há registro em disco do que aconteceu, apenas o que foi visto ao vivo no terminal). 🟡

## Riscos e Lacunas

- 🟡 Os três formatos (`json`/`html`/`sql`) são montados por funções de renderização independentes a partir do mesmo `report_data` — não há um único "source of truth" serializado e depois formatado via templates reutilizáveis; mudanças futuras precisam ser replicadas manualmente nas três funções para não divergir.
- 🟡 Quando `save_report` retorna `None` (falha total ao salvar), não há nenhum artefato persistido da execução — se o operador fechar o terminal logo depois, perde toda a rastreabilidade daquela migração, mesmo que ela tenha sido aplicada com sucesso ao banco.
- 🔴 Não há confirmação, sem um cenário real, se `migration.sql` gerado é sempre executável do início ao fim sem edição manual (ex: ordem de dependência entre tabelas com FK cruzada que não seguiu a ordem de criação original) — não há teste automatizado que valide a re-execução do `migration.sql` gerado contra um banco limpo. Perguntado ao operador em revisão (2026-09-15, `../questions.md#pergunta-7`): não testado/não confirmado — lacuna permanece 🔴, reimplementação deve incluir esse teste antes de considerar o artefato confiável.
- 🟢 **Decisão de revisão (2026-09-15, `../questions.md#pergunta-8`):** a reimplementação deve consolidar `report.json`/`report.html`/`migration.sql` sob um serializador/template único a partir de `report_data`, em vez de manter as três funções de renderização independentes do legado — elimina o risco de divergência manual apontado em `decisions.md` (ADR-0004).
