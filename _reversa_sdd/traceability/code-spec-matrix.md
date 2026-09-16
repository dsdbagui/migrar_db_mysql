# Code/Spec Matrix — migra_db_mysql

> Gerado pelo Redator em 2026-09-15, na fase de Geração.
> Lista, por arquivo (ou trecho de arquivo) do legado, qual unit de spec cobre o quê.
> Complementa `spec-impact-matrix.md` (Arquiteto, foco em componentes/diagramas) com uma visão orientada a arquivo-fonte.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## `migrate_routines.py` (2081 linhas)

| Trecho do legado | Unit correspondente | Cobertura |
|---|---|---|
| `:1-54` (imports, constantes, `HAS_RICH`) | n/a — infraestrutura de módulo, sem regra de negócio própria | n/a |
| `:55-247` (`load_config`, `cfg`, `cfg_ask`, `cfg_confirm`, `select_items`, `write_config_template`) | `arquivo-de-configuracao/` | 🟢 |
| `:248-344` (`connect`, `ask_connection`, `ensure_connected`) | `arquivo-de-configuracao/` (config da conexão) + compartilhado por `migracao-de-rotinas/` e `migracao-de-tabelas/` (uso em runtime) | 🟢 |
| `:345-424` (`fetch_routines`, `fetch_tables`) | `migracao-de-rotinas/` (`:345-387`), `migracao-de-tabelas/` (`:388-424`) | 🟢 |
| `:425-574` (`Issue`, `remove_definer` + `TRANSFORMATIONS` de rotina, `transform_routine`) | `migracao-de-rotinas/` | 🟢 |
| `:575-716` (`TABLE_TRANSFORMATIONS`, `transform_table_ddl`, `strip_foreign_keys`) | `migracao-de-tabelas/` | 🟢 |
| `:717-746` (`drop_if_exists`, `apply_routine`) | `migracao-de-rotinas/` | 🟢 |
| `:747-1076` (`find_referencing_fks`, `drop_referencing_fks`, `apply_table`, `resolve_pending_foreign_keys`, `_resolve_default_value`, `_sql_literal`, `copy_table_data`) | `migracao-de-tabelas/` | 🟢 |
| `:1077-1337` (`print_summary_table`, `print_table_summary`, `render_html_report`) | `relatorios-de-migracao/` | 🟢 |
| `:1338-1498` (`save_report`) | `relatorios-de-migracao/` | 🟢 |
| `:1499-1543` (setup de `main()` anterior à orquestração de rotinas) | `arquivo-de-configuracao/` (leitura de config/conexões) | 🟢 |
| `:1544-1685` (orquestração de rotinas em `main()`) | `migracao-de-rotinas/` | 🟢 |
| `:1686-2059` (orquestração de tabelas em `main()`, incluindo bloco de resumo geral e relatório final) | `migracao-de-tabelas/` (fluxo principal) + `relatorios-de-migracao/` (bloco `# ── Relatório ──`) | 🟢 |
| `:2062-2081` (bloco `argparse`/`__main__`, `--config`/`--init-config`) | `arquivo-de-configuracao/` | 🟢 |

## `fix_collation_stamp.py` (477 linhas, script independente)

| Trecho do legado | Unit correspondente | Cobertura |
|---|---|---|
| Arquivo inteiro (`load_env`, `connect`, `find_stale_routines`, `get_current_db_collation`, `get_ddl`, `recreate_routine`, `save_log`, `main`) | `correcao-de-collation/` | 🟢 |

## Outros arquivos do repositório

| Arquivo | Unit correspondente | Cobertura |
|---|---|---|
| `.env` / `.env.example` | `arquivo-de-configuracao/` (credenciais, fluxo distinto do `--config` JSON) e `correcao-de-collation/` (consumido por `load_env`) | 🟡 |
| `migration_config*.json` (template opcional gerado por `--init-config`) | `arquivo-de-configuracao/` | 🟢 |
| `README.md` | n/a — documentação de uso, sem regra de negócio própria | n/a |
| `CLAUDE.md` | n/a — guia de arquitetura para agentes de IA, fonte de contexto para o próprio Reversa, não código de produção | n/a |
| `AGENTS.md` | n/a — artefato gerado pelo instalador do Reversa | n/a |
| `.gitignore` | n/a | n/a |
| `migration_report_<timestamp>/` (5 diretórios presentes no repo) | `relatorios-de-migracao/` — são **saídas** de execução, não código-fonte; confirmam o formato descrito na unit mas não são especificados por ela | 🟡 (evidência empírica, não fonte normativa) |
| `fix_collation_db_formosa_20260615_083733/` (`log.json`, `recreated.sql`) | `correcao-de-collation/` — saída de execução, mesmo caso acima | 🟡 |

## Resumo de cobertura

- **Arquivos de código-fonte de produção:** 2 (`migrate_routines.py`, `fix_collation_stamp.py`) — 100% do código mapeado a alguma unit. 🟢
- **Sem cobertura de spec (n/a):** arquivos de documentação/meta (`README.md`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`) e artefatos gerados em runtime (`migration_report_*/`, `fix_collation_*/`) — esperado, não é uma lacuna real: nenhum contém regra de negócio própria a especificar. 🟢
- **Candidatos a análise adicional:** nenhum — não há arquivo de código-fonte sem unit correspondente.

## Rastreabilidade reversa (unit → arquivos)

| Unit | Arquivo(s) do legado |
|---|---|
| `migracao-de-rotinas/` | `migrate_routines.py:345-424` (parcial), `:425-574`, `:717-746`, `:1544-1685` |
| `migracao-de-tabelas/` | `migrate_routines.py:345-424` (parcial), `:575-716`, `:747-1076`, `:1686-1995` (parcial) |
| `arquivo-de-configuracao/` | `migrate_routines.py:55-344` (parcial), `:1499-1543`, `:1996-1934`; `.env`/`.env.example`; `migration_config*.json` |
| `relatorios-de-migracao/` | `migrate_routines.py:1077-1498`, `:1686-1995` (parcial); `migration_report_*/` (saídas) |
| `correcao-de-collation/` | `fix_collation_stamp.py` (inteiro); `.env`; `fix_collation_*/` (saídas) |
