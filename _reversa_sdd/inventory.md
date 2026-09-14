# Inventário — migra_db_mysql

> Gerado pelo Scout em 2026-09-01

## Visão geral

Repositório pequeno, sem estrutura de pastas de aplicação: dois scripts Python de linha de comando, autocontidos, para migração de bancos MySQL 5.x → 8.x. Não é uma aplicação web/serviço — não há servidor, rotas, frontend nem ORM. Nenhuma pasta top-level de domínio; toda a lógica de negócio vive dentro dos dois arquivos `.py`.

## Estrutura de pastas

```
migra_db_mysql/
├── migrate_routines.py          # ferramenta principal (1933 linhas)
├── fix_collation_stamp.py       # script auxiliar (476 linhas)
├── .env / .env.example          # credenciais de conexão MySQL (gitignored)
├── .gitignore
├── README.md
├── CLAUDE.md                    # guia de arquitetura para agentes de IA
├── AGENTS.md
├── __pycache__/                 # artefato de execução (ignorado)
├── fix_collation_db_formosa_20260615_083733/   # saída de execução do fix_collation_stamp.py
│   ├── log.json
│   └── recreated.sql
├── migration_report_20260723_131432/           # saídas de execução do migrate_routines.py
├── migration_report_20260821_103914/
├── migration_report_20260821_121321/
├── migration_report_20260821_132920/
└── migration_report_20260821_154719/
```

As pastas `migration_report_*/` e `fix_collation_*/` são artefatos gerados a cada execução (timestampados), não código-fonte — todas listadas no `.gitignore`. Cada `migration_report_<ts>/` contém `migration.sql`, `report.json` e, nas execuções mais recentes, `report.html` (relatório visual) e `retry_tables.sql` (SQL de retry para falhas).

## Linguagem

- **Python 3** (uso de `list[dict]`, `tuple[...]`, `Optional[...]` como anotação nativa → requer Python ≥ 3.9) — 100% do código-fonte, 2 arquivos, 2409 linhas.

## Frameworks e bibliotecas

Sem gerenciador de pacotes formal (não há `requirements.txt`, `pyproject.toml` ou `setup.py`). Dependências documentadas apenas no docstring de cada script e no README:

| Biblioteca | Uso | Onde é declarada |
|---|---|---|
| `mysql-connector-python` | Conexão e queries MySQL (`mysql.connector.connect`, `information_schema`) | docstring + README (`pip install mysql-connector-python rich`) |
| `rich` | Saída colorida no terminal (console, tabelas, prompts, progress bar) — opcional, com fallback para `print`/`input` puro via flag `HAS_RICH` | idem |

Bibliotecas padrão usadas: `re`, `sys`, `json`, `html`, `argparse`, `getpass`, `os`, `datetime`, `pathlib`, `typing`.

## Pontos de entrada

| Arquivo | Tipo | Como é chamado |
|---|---|---|
| `migrate_routines.py` | CLI principal (interativo) | `python migrate_routines.py` — aceita `--config <arquivo>` e `--init-config <arquivo>` via `argparse` (linha 1914) |
| `fix_collation_stamp.py` | CLI auxiliar (interativo) | `python fix_collation_stamp.py` — lê `.env` na mesma pasta ou pergunta interativamente |

Não há CI/CD (`.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml` ausentes), `Dockerfile` ou `docker-compose.yml`.

### Arquivos de configuração

- `.env` / `.env.example` — credenciais de conexão MySQL (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Ambos listados no `.gitignore` — **atenção:** `.env.example` já contém valores que parecem ser credenciais reais de rede interna (IP, usuário e senha), não placeholders; vale confirmar com o time se isso é intencional (arquivo local de exemplo) ou se deveria ser sanitizado.
- `migration_config*.json` — template opcional gerado por `--init-config` para pré-responder os prompts interativos de `migrate_routines.py` (ver `write_config_template`, linha 188). Nenhum arquivo desse tipo está presente no repositório no momento (apenas o padrão no `.gitignore`).

## Schema de banco de dados

Não há arquivos DDL, migrations ou modelos ORM no repositório. Os scripts descobrem o schema **em tempo de execução**, via `information_schema.ROUTINES`, `SHOW CREATE PROCEDURE/FUNCTION`, `SHOW CREATE TABLE` e `information_schema.KEY_COLUMN_USAGE` / `REFERENTIAL_CONSTRAINTS` (para foreign keys) — apontando para o banco de origem/destino configurado interativamente ou via `.env`. Análise detalhada de schema fica a cargo do `reversa-data-master`, mas não há arquivo estático de schema para inspecionar — a única fonte é o banco MySQL em si (não disponível para este agente).

## Cobertura de testes

Nenhum framework de teste identificado. Nenhum arquivo `*.test.*` ou `*.spec.*` encontrado. Cobertura de testes automatizados: **0%** — nenhuma suíte de testes no repositório.

## Organização sugerida das specs

Ver `organization_suggestion` em `.reversa/context/surface.json`. Como não há pastas de domínio, roteamento ou specs BDD, a heurística caiu no fallback `feature`, com as features extraídas por área funcional dos dois scripts (ver seções do `CLAUDE.md`).
