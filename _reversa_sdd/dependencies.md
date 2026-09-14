# Dependências — migra_db_mysql

> Gerado pelo Scout em 2026-09-01

## Gerenciador de pacotes

Nenhum. Não há `requirements.txt`, `pyproject.toml`, `Pipfile` ou `setup.py`. As dependências são instaladas manualmente via `pip install` conforme instrução no docstring dos scripts e no `README.md`:

```bash
pip install mysql-connector-python rich
```

Nenhuma versão é fixada (pinned) em lugar nenhum — sempre instala a última versão disponível no PyPI no momento da instalação.

## Dependências de terceiros

| Pacote | Versão | Obrigatória? | Uso |
|---|---|---|---|
| `mysql-connector-python` | não fixada | **Sim** — sem ela o script aborta (`sys.exit(1)`) | Driver de conexão MySQL (`import mysql.connector`, `from mysql.connector import Error as MySQLError`) em ambos os scripts |
| `rich` | não fixada | Não — fallback automático para `print`/`input` puro via flag `HAS_RICH` em ambos os scripts | Saída formatada no terminal: `Console`, `Table`, `Panel`, `Prompt`, `Confirm`, `Syntax`, `Progress`/`SpinnerColumn`/`TextColumn` |

## Biblioteca padrão (stdlib)

Usadas em `migrate_routines.py` e/ou `fix_collation_stamp.py`, sem instalação adicional necessária:

`re`, `sys`, `json`, `html`, `argparse`, `getpass`, `os`, `datetime`, `pathlib`, `typing`

## Runtime

Python ≥ 3.9 (uso de sintaxe de generics nativa em type hints: `list[dict]`, `tuple[str, Optional[Issue]]`).

## Observação

Como não há arquivo de lock/manifest, não é possível auditar versões exatas instaladas nem detectar vulnerabilidades conhecidas por versão sem acesso ao ambiente onde os scripts rodam. Recomenda-se, se o time achar valioso, formalizar um `requirements.txt` com versões fixadas — isso está fora do escopo do Scout (apenas inventário), fica como sugestão para as fases seguintes.
