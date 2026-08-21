#!/usr/bin/env python3
"""
migrate_routines.py
Migração interativa de procedures, functions e tabelas MySQL 5.x → 8.x
- Remove/substitui DEFINER
- Detecta e corrige incompatibilidades comuns
- Migra tabelas: apenas esquema (DDL) ou esquema + dados
- Gera relatório de migração
- Aplica no destino com confirmação

Uso no Claude Code:
  python migrate_routines.py

Uso com arquivo de respostas (pula as perguntas interativas):
  python migrate_routines.py --init-config migration_config.json   # gera o modelo
  python migrate_routines.py --config migration_config.json        # usa o modelo preenchido

Dependências:
  pip install mysql-connector-python rich
"""

import re
import sys
import json
import html
import argparse
import getpass
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
except ImportError:
    print("❌  Instale: pip install mysql-connector-python")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.prompt import Prompt, Confirm
    from rich.syntax import Syntax
    from rich.progress import Progress, SpinnerColumn, TextColumn
    HAS_RICH = True
except ImportError:
    print("⚠️  rich não instalado. Usando saída simples. (pip install rich)")
    HAS_RICH = False

console = Console() if HAS_RICH else None

BATCH_SIZE = 500

CONFIG: dict = {}  # carregado de --config; ver load_config/cfg/cfg_ask/cfg_confirm


# ─────────────────────────────────────────────────────────────
# HELPERS DE OUTPUT
# ─────────────────────────────────────────────────────────────

def info(msg):
    if HAS_RICH:
        console.print(f"[cyan]ℹ[/cyan]  {msg}")
    else:
        print(f"INFO: {msg}")

def ok(msg):
    if HAS_RICH:
        console.print(f"[green]✔[/green]  {msg}")
    else:
        print(f"OK: {msg}")

def warn(msg):
    if HAS_RICH:
        console.print(f"[yellow]⚠[/yellow]  {msg}")
    else:
        print(f"WARN: {msg}")

def error(msg):
    if HAS_RICH:
        console.print(f"[red]✘[/red]  {msg}")
    else:
        print(f"ERROR: {msg}")

def header(msg):
    if HAS_RICH:
        console.rule(f"[bold]{msg}[/bold]")
    else:
        print(f"\n{'='*60}\n{msg}\n{'='*60}")

def ask(prompt, default=None, password=False):
    if HAS_RICH:
        if password:
            return Prompt.ask(prompt, password=True, default=default or "")
        return Prompt.ask(prompt, default=default or "")
    else:
        if password:
            return getpass.getpass(f"{prompt}: ") or default
        val = input(f"{prompt} [{default}]: ").strip()
        return val if val else default

def confirm(msg, default=True):
    if HAS_RICH:
        return Confirm.ask(msg, default=default)
    else:
        resp = input(f"{msg} [{'Y/n' if default else 'y/N'}]: ").strip().lower()
        if not resp:
            return default
        return resp in ("y", "yes", "s", "sim")


# ─────────────────────────────────────────────────────────────
# ARQUIVO DE CONFIGURAÇÃO (--config / --init-config)
# ─────────────────────────────────────────────────────────────

def load_config(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        error(f"Arquivo de configuração não encontrado: {path}")
        sys.exit(1)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        error(f"Configuração inválida em {path}: {e}")
        sys.exit(1)
    ok(f"Configuração carregada de {path} — perguntas já respondidas nela serão puladas.")
    return data


def cfg(key: str, default=None):
    """Busca um valor no CONFIG carregado via caminho com pontos (ex: 'tables.force_innodb').
    Retorna default se o arquivo não tiver essa chave (ou não houver config carregada)."""
    node = CONFIG
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return default if node is None else node


def cfg_ask(key: str, prompt: str, default=None, password=False):
    val = cfg(key)
    if val is not None:
        info(f"[config] {prompt}: {'••••••' if password else val}")
        return str(val)
    return ask(prompt, default, password=password)


def cfg_confirm(key: str, prompt: str, default: bool = True) -> bool:
    val = cfg(key)
    if val is not None:
        info(f"[config] {prompt} → {'Sim' if val else 'Não'}")
        return bool(val)
    return confirm(prompt, default=default)


def select_items(items: list[dict], cfg_key: str, label: str) -> list[int]:
    """Resolve a seleção de rotinas/tabelas: 'all' ou uma lista de nomes exatos via
    config (cfg_key), ou os prompts interativos originais (todas / números)."""
    cfg_sel = cfg(cfg_key)
    if cfg_sel is not None:
        if cfg_sel == "all":
            info(f"[config] Migrar TODAS as {label}s listadas → Sim")
            return list(range(len(items)))
        wanted = set(cfg_sel)
        idx = [i for i, it in enumerate(items) if it["name"] in wanted]
        missing = wanted - {items[i]["name"] for i in idx}
        if missing:
            warn(f"[config] {label}(s) não encontrada(s) na origem: {', '.join(sorted(missing))}")
        info(f"[config] Selecionadas {len(idx)} {label}(s) via config.")
        return idx

    if confirm(f"Migrar TODAS as {label}s listadas?", default=True):
        return list(range(len(items)))
    raw = ask("Informe os números separados por vírgula (ex: 1,3,5)")
    selected = []
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            i = int(part) - 1
            if 0 <= i < len(items):
                selected.append(i)
    info(f"Selecionadas {len(selected)} {label}(s).")
    return selected


def write_config_template(path: str) -> None:
    template = {
        "_readme": (
            "Preencha os campos para pular as perguntas do migrate_routines.py. "
            "Campos ausentes (ou removidos) continuam sendo perguntados normalmente — "
            "pode preencher só parte do arquivo. Rode com: "
            f"python migrate_routines.py --config {path}"
        ),
        "source": {"host": "127.0.0.1", "port": 3306, "user": "root", "password": "", "database": ""},
        "destination": {"host": "127.0.0.1", "port": 3307, "user": "root", "password": "", "database": ""},
        "migrate_routines": True,
        "migrate_tables": True,
        "new_definer": None,
        "routines": {
            "select": "all",
            "_comment_select": "'all' ou lista com os nomes exatos, ex: [\"MinhaProc\", \"MinhaFunc\"]",
            "drop_existing": True,
            "apply": True,
            "view_compatibility_details": False,
        },
        "tables": {
            "select": "all",
            "_comment_select": "'all' ou lista com os nomes exatos, ex: [\"tabela1\", \"tabela2\"]",
            "copy_data": False,
            "skip_create": False,
            "force_innodb": True,
            "drop_existing": True,
            "filters": {},
            "_comment_filters": "cláusula WHERE por tabela, ex: {\"tabela1\": \"CodigoConsignante=139\"}",
            "apply": True,
            "view_compatibility_details": False,
            "restore_removed_fks": True,
        },
        "save_report": True,
        "view_failed_routine_ddl": False,
    }
    Path(path).write_text(json.dumps(template, ensure_ascii=False, indent=2), encoding="utf-8")
    ok(f"Configuração modelo gerada em: {path}")
    info(f"Edite os valores e rode: python migrate_routines.py --config {path}")


# ─────────────────────────────────────────────────────────────
# CONEXÃO
# ─────────────────────────────────────────────────────────────

def connect(label: str, host: str, port: int, user: str, password: str, database: str,
            charset: Optional[str] = None):
    """Retorna conexão mysql.connector ou None."""
    kwargs = dict(host=host, port=port, user=user, password=password,
                  database=database, connection_timeout=10)
    if charset:
        kwargs["charset"] = charset
    try:
        conn = mysql.connector.connect(**kwargs)
        ok(f"Conectado ao {label}: {user}@{host}:{port}/{database}")
        return conn
    except MySQLError as e:
        # Servidores MySQL antigos (5.1/5.5 sem suporte a utf8mb4) rejeitam o
        # charset padrão negociado pelo connector — tenta uma vez com utf8.
        if e.errno == 1115 and not charset:
            warn(f"{label}: servidor não suporta utf8mb4 (comum em MySQL 5 antigo) "
                 f"— tentando novamente com charset utf8...")
            return connect(label, host, port, user, password, database, charset="utf8")
        error(f"Falha ao conectar {label}: {e}")
        return None

def ask_connection(label: str, defaults: dict, cfg_prefix: Optional[str] = None) -> tuple[Optional[object], dict]:
    header(f"Conexão — {label}")
    if cfg_prefix:
        host_raw = cfg_ask(f"{cfg_prefix}.host", "Host", defaults.get("host", "127.0.0.1"))
        port_raw = cfg_ask(f"{cfg_prefix}.port", "Port", str(defaults.get("port", 3306)))
        user     = cfg_ask(f"{cfg_prefix}.user", "Usuário", defaults.get("user", "root"))
        password = cfg_ask(f"{cfg_prefix}.password", "Senha", password=True)
        database = cfg_ask(f"{cfg_prefix}.database", "Database", defaults.get("database", ""))
    else:
        host_raw = ask("Host", defaults.get("host", "127.0.0.1"))
        port_raw = ask("Port", str(defaults.get("port", 3306)))
        user     = ask("Usuário",  defaults.get("user", "root"))
        password = ask("Senha",    password=True)
        database = ask("Database", defaults.get("database", ""))

    host = re.sub(r'^\w+://', '', host_raw.strip()).split('/')[0]
    if host != host_raw.strip():
        warn(f"Host ajustado de '{host_raw}' para '{host}' (removido protocolo/caminho de URL)")
    port = int(port_raw)
    params = {"host": host, "port": port, "user": user, "password": password, "database": database}
    conn = connect(label, **params)
    if conn is None and confirm("Tentar novamente?"):
        return ask_connection(label, {"host": host, "port": port, "user": user, "database": database})
    return conn, params


def ensure_connected(conn, label: str, params: dict):
    """Verifica se a conexão continua ativa e reconecta se necessário.
    Prompts interativos longos (filtros por tabela, revisão de compatibilidade)
    podem deixar a conexão ociosa tempo suficiente para o servidor derrubá-la."""
    try:
        if conn is not None and conn.is_connected():
            return conn
    except Exception:
        pass
    warn(f"Conexão com {label} perdida — reconectando...")
    new_conn = connect(label, **params)
    if new_conn is None:
        error(f"Não foi possível restabelecer conexão com {label}.")
    return new_conn


# ─────────────────────────────────────────────────────────────
# EXTRAÇÃO DE ROTINAS (origem)
# ─────────────────────────────────────────────────────────────

def fetch_routines(conn, database: str) -> list[dict]:
    """Retorna lista de dicts com metadados e corpo de cada rotina."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            ROUTINE_NAME        AS name,
            ROUTINE_TYPE        AS type,
            DEFINER             AS definer,
            CHARACTER_SET_CLIENT AS charset,
            COLLATION_CONNECTION AS collation,
            DATABASE_COLLATION   AS db_collation,
            SQL_MODE             AS sql_mode,
            ROUTINE_DEFINITION   AS body_def
        FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA = %s
        ORDER BY ROUTINE_TYPE, ROUTINE_NAME
    """, (database,))
    rows = cursor.fetchall()
    cursor.close()

    routines = []
    for row in rows:
        try:
            cur2 = conn.cursor()
            if row["type"] == "PROCEDURE":
                cur2.execute(f"SHOW CREATE PROCEDURE `{database}`.`{row['name']}`")
            else:
                cur2.execute(f"SHOW CREATE FUNCTION `{database}`.`{row['name']}`")
            ddl_row = cur2.fetchone()
            cur2.close()
            row["ddl_original"] = ddl_row[2] if ddl_row else None
        except Exception as e:
            row["ddl_original"] = None
            row["extract_error"] = str(e)
        routines.append(row)

    return routines


# ─────────────────────────────────────────────────────────────
# EXTRAÇÃO DE TABELAS (origem)
# ─────────────────────────────────────────────────────────────

def fetch_tables(conn, database: str) -> list[dict]:
    """Retorna lista de dicts com metadados e DDL de cada tabela."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            TABLE_NAME      AS name,
            ENGINE          AS engine,
            TABLE_ROWS      AS approx_rows,
            TABLE_COLLATION AS collation
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    """, (database,))
    rows = cursor.fetchall()
    cursor.close()

    tables = []
    for row in rows:
        try:
            cur2 = conn.cursor()
            cur2.execute(f"SHOW CREATE TABLE `{database}`.`{row['name']}`")
            ddl_row = cur2.fetchone()
            cur2.close()
            # índice 1 = Create Table
            row["ddl_original"] = ddl_row[1] if ddl_row else None
        except Exception as e:
            row["ddl_original"] = None
            row["extract_error"] = str(e)
        tables.append(row)

    return tables


# ─────────────────────────────────────────────────────────────
# TRANSFORMAÇÕES DE ROTINAS / CORREÇÕES
# ─────────────────────────────────────────────────────────────

class Issue:
    def __init__(self, code: str, severity: str, description: str, original: str, fixed: str):
        self.code        = code
        self.severity    = severity   # "error" | "warning" | "info"
        self.description = description
        self.original    = original
        self.fixed       = fixed


def remove_definer(ddl: str, new_definer: Optional[str] = None) -> tuple[str, Optional[Issue]]:
    """
    Remove DEFINER=`x`@`y` do DDL.
    Se new_definer fornecido, substitui; caso contrário, remove completamente.
    """
    pattern = r"DEFINER\s*=\s*`[^`]*`\s*@\s*`[^`]*`\s*"
    match = re.search(pattern, ddl, re.IGNORECASE)
    if not match:
        return ddl, None

    original_definer = match.group(0).strip()
    if new_definer:
        replacement = f"DEFINER={new_definer} "
        new_ddl = re.sub(pattern, replacement, ddl, flags=re.IGNORECASE)
        issue = Issue("DEFINER_REPLACED", "info",
                      f"DEFINER substituído por {new_definer}",
                      original_definer, replacement.strip())
    else:
        new_ddl = re.sub(pattern, "", ddl, flags=re.IGNORECASE)
        issue = Issue("DEFINER_REMOVED", "info",
                      "DEFINER removido",
                      original_definer, "(sem DEFINER)")
    return new_ddl, issue


def fix_sql_security(ddl: str) -> tuple[str, Optional[Issue]]:
    """SQL SECURITY DEFINER → SQL SECURITY INVOKER (opcional, avisa)."""
    if re.search(r"SQL\s+SECURITY\s+DEFINER", ddl, re.IGNORECASE):
        return ddl, Issue("SQL_SECURITY_DEFINER", "warning",
                          "SQL SECURITY DEFINER encontrado — considere trocar para INVOKER no MySQL 8",
                          "SQL SECURITY DEFINER", "(sem alteração automática)")
    return ddl, None


def fix_no_default_charset(ddl: str) -> tuple[str, Optional[Issue]]:
    """Remove charset/collation inline que pode falhar no MySQL 8."""
    pattern = r"CHARACTER\s+SET\s+\w+\s*(?:COLLATE\s+\w+)?"
    match = re.search(pattern, ddl, re.IGNORECASE)
    if match:
        new_ddl = re.sub(pattern, "", ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("CHARSET_INLINE", "warning",
                              "CHARACTER SET inline removido (pode conflitar com collation do servidor MySQL 8)",
                              match.group(0), "")
    return ddl, None


def fix_group_concat_maxlen(ddl: str) -> tuple[str, Optional[Issue]]:
    """Detecta GROUP_CONCAT sem limit — aviso apenas."""
    if re.search(r"GROUP_CONCAT\s*\(", ddl, re.IGNORECASE):
        return ddl, Issue("GROUP_CONCAT", "warning",
                          "GROUP_CONCAT encontrado — verifique group_concat_max_len no MySQL 8 (padrão 1024)",
                          "GROUP_CONCAT(...)", "(sem alteração automática)")
    return ddl, None


def fix_set_option(ddl: str) -> tuple[str, Optional[Issue]]:
    """SET OPTION foi removido no MySQL 8 — substitui por SET."""
    if re.search(r"\bSET\s+OPTION\b", ddl, re.IGNORECASE):
        new_ddl = re.sub(r"\bSET\s+OPTION\b", "SET", ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("SET_OPTION", "error",
                              "SET OPTION é inválido no MySQL 8 — substituído por SET",
                              "SET OPTION", "SET")
    return ddl, None


def fix_old_password_hash(ddl: str) -> tuple[str, Optional[Issue]]:
    """OLD_PASSWORD() removido no MySQL 8."""
    if re.search(r"\bOLD_PASSWORD\s*\(", ddl, re.IGNORECASE):
        return ddl, Issue("OLD_PASSWORD", "error",
                          "OLD_PASSWORD() removido no MySQL 8 — substitua por PASSWORD() ou SHA2()",
                          "OLD_PASSWORD()", "(sem alteração automática — requer revisão manual)")
    return ddl, None


def fix_no_zero_date(ddl: str) -> tuple[str, Optional[Issue]]:
    """Datas zero '0000-00-00' geram erro com sql_mode NO_ZERO_DATE ativo no MySQL 8."""
    if re.search(r"['\"]0000-00-00", ddl):
        return ddl, Issue("ZERO_DATE", "warning",
                          "Data '0000-00-00' encontrada — pode falhar com NO_ZERO_DATE no MySQL 8",
                          "'0000-00-00'", "(sem alteração automática)")
    return ddl, None


def fix_only_full_group_by(ddl: str) -> tuple[str, Optional[Issue]]:
    """Detecta possível violação de ONLY_FULL_GROUP_BY."""
    has_group = re.search(r"\bGROUP\s+BY\b", ddl, re.IGNORECASE)
    has_select_star = re.search(r"\bSELECT\b.*\*", ddl, re.IGNORECASE | re.DOTALL)
    if has_group and has_select_star:
        return ddl, Issue("ONLY_FULL_GROUP_BY", "warning",
                          "SELECT * com GROUP BY pode violar ONLY_FULL_GROUP_BY (ativo por padrão no MySQL 8)",
                          "SELECT * ... GROUP BY", "(sem alteração automática)")
    return ddl, None


def clean_sql_mode(ddl: str) -> tuple[str, Optional[Issue]]:
    """Remove sql_mode='' ou configurações que não existem mais no MySQL 8."""
    if re.search(r"NO_AUTO_CREATE_USER", ddl, re.IGNORECASE):
        new_ddl = re.sub(r",?\s*NO_AUTO_CREATE_USER", "", ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("SQL_MODE_NO_AUTO_CREATE_USER", "error",
                              "NO_AUTO_CREATE_USER removido do sql_mode (inválido no MySQL 8)",
                              "NO_AUTO_CREATE_USER", "(removido)")
    return ddl, None


def normalize_delimiter(ddl: str, name: str, rtype: str) -> str:
    """Garante que o DDL está pronto para execução direta (sem DELIMITER externo)."""
    return ddl.strip().rstrip(";")


TRANSFORMATIONS = [
    fix_set_option,
    fix_old_password_hash,
    clean_sql_mode,
    fix_no_zero_date,
    fix_group_concat_maxlen,
    fix_sql_security,
    fix_no_default_charset,
    fix_only_full_group_by,
]


def transform_routine(ddl: str, new_definer: Optional[str] = None) -> tuple[str, list[Issue]]:
    """Aplica todas as transformações e retorna DDL corrigido + lista de issues."""
    issues: list[Issue] = []

    ddl, issue = remove_definer(ddl, new_definer)
    if issue:
        issues.append(issue)

    for fn in TRANSFORMATIONS:
        ddl, issue = fn(ddl)
        if issue:
            issues.append(issue)

    return ddl, issues


# ─────────────────────────────────────────────────────────────
# TRANSFORMAÇÕES DE TABELAS
# ─────────────────────────────────────────────────────────────

def fix_table_utf8(ddl: str) -> tuple[str, Optional[Issue]]:
    """Substitui charset utf8 → utf8mb4 (utf8mb3 está deprecado no MySQL 8)."""
    new_ddl = ddl
    # Collations primeiro: utf8_xxx → utf8mb4_xxx
    new_ddl = re.sub(r'\butf8_', 'utf8mb4_', new_ddl, flags=re.IGNORECASE)
    # Charset: utf8 (mas não utf8mb4 já existente)
    new_ddl = re.sub(r'\butf8\b(?!mb)', 'utf8mb4', new_ddl, flags=re.IGNORECASE)
    if new_ddl != ddl:
        return new_ddl, Issue("UTF8_CHARSET", "warning",
                              "charset utf8 → utf8mb4 (utf8mb3 deprecado no MySQL 8)",
                              "utf8", "utf8mb4")
    return ddl, None


def fix_table_type_keyword(ddl: str) -> tuple[str, Optional[Issue]]:
    """TYPE=Engine → ENGINE=Engine (sintaxe MySQL 4.x, inválida no MySQL 8)."""
    if re.search(r'\bTYPE\s*=\s*\w+', ddl, re.IGNORECASE):
        new_ddl = re.sub(r'\bTYPE\s*=\s*(\w+)', r'ENGINE=\1', ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("TYPE_TO_ENGINE", "error",
                              "TYPE= é inválido no MySQL 8 — substituído por ENGINE=",
                              "TYPE=", "ENGINE=")
    return ddl, None


def fix_table_myisam_options(ddl: str) -> tuple[str, Optional[Issue]]:
    """Remove opções exclusivas do MyISAM que causam aviso/erro no MySQL 8 com InnoDB."""
    patterns = [r'PACK_KEYS\s*=\s*\d', r'DELAY_KEY_WRITE\s*=\s*\d', r'CHECKSUM\s*=\s*\d']
    found = []
    new_ddl = ddl
    for pat in patterns:
        m = re.search(pat, new_ddl, re.IGNORECASE)
        if m:
            found.append(m.group(0))
            new_ddl = re.sub(r'\s*' + pat, '', new_ddl, flags=re.IGNORECASE)
    if found:
        return new_ddl, Issue("MYISAM_OPTIONS", "warning",
                              f"Opções MyISAM removidas: {', '.join(found)}",
                              ", ".join(found), "(removidas)")
    return ddl, None


def fix_table_engine_to_innodb(ddl: str) -> tuple[str, Optional[Issue]]:
    """Converte ENGINE=MyISAM (ou outro engine não-InnoDB) para ENGINE=InnoDB."""
    m = re.search(r'\bENGINE\s*=\s*(\w+)', ddl, re.IGNORECASE)
    if m and m.group(1).upper() != "INNODB":
        new_ddl = re.sub(r'\bENGINE\s*=\s*\w+', 'ENGINE=InnoDB', ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("ENGINE_TO_INNODB", "warning",
                              f"ENGINE={m.group(1)} → ENGINE=InnoDB",
                              f"ENGINE={m.group(1)}", "ENGINE=InnoDB")
    return ddl, None


def fix_table_zerofill(ddl: str) -> tuple[str, Optional[Issue]]:
    """ZEROFILL está deprecado no MySQL 8.0.17+."""
    if re.search(r'\bZEROFILL\b', ddl, re.IGNORECASE):
        return ddl, Issue("ZEROFILL", "warning",
                          "ZEROFILL está deprecado no MySQL 8.0.17 — considere remover",
                          "ZEROFILL", "(sem alteração automática)")
    return ddl, None


def fix_table_int_display_width(ddl: str) -> tuple[str, Optional[Issue]]:
    """Remove display width de tipos inteiros (deprecado no MySQL 8.0.17).
    Preserva TINYINT(1) pois é convenção de booleano em ORMs."""
    pattern = r'\b(SMALLINT|MEDIUMINT|BIGINT|INT)\s*\(\d+\)'
    if re.search(pattern, ddl, re.IGNORECASE):
        new_ddl = re.sub(pattern, lambda m: m.group(1).upper(), ddl, flags=re.IGNORECASE)
        return new_ddl, Issue("INT_DISPLAY_WIDTH", "info",
                              "Display width de inteiros removido (deprecado no MySQL 8.0.17)",
                              "INT(N)", "INT")
    return ddl, None


FK_CONSTRAINT_PATTERN = re.compile(
    r",\s*CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY\s*\(([^)]*)\)\s*"
    r"REFERENCES\s+(?:`[^`]+`\.)?`([^`]+)`\s*\(([^)]*)\)([^,)]*)",
    re.IGNORECASE,
)


def _parse_col_list(raw: str) -> list[str]:
    return [c.strip().strip('`') for c in raw.split(",") if c.strip()]


def strip_foreign_keys(ddl: str) -> tuple[str, list[Issue], list[dict]]:
    """Remove todas as constraints FOREIGN KEY do DDL.
    Usado como fallback quando o MySQL 8 rejeita a criação da tabela por falta de
    unique key na tabela referenciada (erro 6125 / 1215) — comum ao migrar esquemas
    legados onde o FK foi declarado sobre uma coluna sem UNIQUE/PRIMARY KEY no pai.
    Retorna (ddl_sem_fks, issues, fk_specs) — fk_specs guarda os dados necessários
    para tentar restaurar cada FK depois (ver resolve_pending_foreign_keys)."""
    issues: list[Issue] = []
    fk_specs: list[dict] = []

    def _replace(m):
        fk_name, child_cols, ref_table, ref_cols, extra = m.groups()
        issues.append(Issue(
            "FK_REMOVED", "warning",
            f"FOREIGN KEY `{fk_name}` (→ `{ref_table}`) removida — tabela referenciada "
            f"não tem unique key compatível no MySQL 8",
            m.group(0).strip(), "(removida)",
        ))
        fk_specs.append({
            "fk_name":    fk_name,
            "child_cols": _parse_col_list(child_cols),
            "ref_table":  ref_table,
            "ref_cols":   _parse_col_list(ref_cols),
            "extra":      extra.strip(),
        })
        return ""

    new_ddl = FK_CONSTRAINT_PATTERN.sub(_replace, ddl)
    return new_ddl, issues, fk_specs


TABLE_TRANSFORMATIONS = [
    fix_table_type_keyword,
    fix_table_utf8,
    fix_table_myisam_options,
    fix_table_zerofill,
    fix_table_int_display_width,
]


def transform_table_ddl(ddl: str, force_innodb: bool = False) -> tuple[str, list[Issue]]:
    """Aplica todas as transformações de tabela e retorna DDL corrigido + issues."""
    issues: list[Issue] = []
    for fn in TABLE_TRANSFORMATIONS:
        ddl, issue = fn(ddl)
        if issue:
            issues.append(issue)
    if force_innodb:
        ddl, issue = fix_table_engine_to_innodb(ddl)
        if issue:
            issues.append(issue)
    return ddl, issues


# ─────────────────────────────────────────────────────────────
# APLICAÇÃO NO DESTINO — ROTINAS
# ─────────────────────────────────────────────────────────────

def drop_if_exists(conn, database: str, name: str, rtype: str):
    cursor = conn.cursor()
    try:
        cursor.execute(f"DROP {rtype} IF EXISTS `{database}`.`{name}`")
        conn.commit()
    except Exception:
        pass
    finally:
        cursor.close()


def apply_routine(conn, database: str, ddl: str) -> Optional[str]:
    """Executa o DDL no destino. Retorna None em sucesso ou mensagem de erro."""
    cursor = conn.cursor()
    try:
        cursor.execute(f"USE `{database}`")
        cursor.execute(ddl)
        conn.commit()
        return None
    except MySQLError as e:
        conn.rollback()
        return str(e)
    finally:
        cursor.close()


# ─────────────────────────────────────────────────────────────
# APLICAÇÃO NO DESTINO — TABELAS
# ─────────────────────────────────────────────────────────────

def drop_table_if_exists(conn, database: str, table_name: str):
    cursor = conn.cursor()
    try:
        cursor.execute(f"DROP TABLE IF EXISTS `{database}`.`{table_name}`")
        conn.commit()
    except Exception:
        pass
    finally:
        cursor.close()


FK_ERROR_CODES = {1215, 6125}  # "Cannot add foreign key constraint" / missing unique key no pai


def find_referencing_fks(conn, database: str, table_name: str) -> list[dict]:
    """Lista as constraints FOREIGN KEY de OUTRAS tabelas do schema que referenciam
    table_name. Usado para achar FKs 'órfãs' deixadas por uma execução anterior —
    quando table_name é dropada e recriada, uma FK antiga de outra tabela que ainda
    aponta para ela impede a criação (mesmo com FOREIGN_KEY_CHECKS=0)."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = %s AND REFERENCED_TABLE_SCHEMA = %s AND REFERENCED_TABLE_NAME = %s
        ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
    """, (database, database, table_name))
    rows = cursor.fetchall()

    rules_by_name = {}
    if rows:
        cursor.execute("""
            SELECT CONSTRAINT_NAME, TABLE_NAME, UPDATE_RULE, DELETE_RULE
            FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = %s AND REFERENCED_TABLE_NAME = %s
        """, (database, table_name))
        for r in cursor.fetchall():
            rules_by_name[(r["TABLE_NAME"], r["CONSTRAINT_NAME"])] = (r["UPDATE_RULE"], r["DELETE_RULE"])
    cursor.close()

    specs: dict = {}
    for row in rows:
        key = (row["TABLE_NAME"], row["CONSTRAINT_NAME"])
        spec = specs.setdefault(key, {
            "fk_name":     row["CONSTRAINT_NAME"],
            "child_table": row["TABLE_NAME"],
            "child_cols":  [],
            "ref_table":   table_name,
            "ref_cols":    [],
            "extra":       "",
        })
        spec["child_cols"].append(row["COLUMN_NAME"])
        spec["ref_cols"].append(row["REFERENCED_COLUMN_NAME"])

    for (child_table, fk_name), spec in specs.items():
        update_rule, delete_rule = rules_by_name.get((child_table, fk_name), (None, None))
        extra = ""
        if delete_rule and delete_rule != "RESTRICT":
            extra += f" ON DELETE {delete_rule}"
        if update_rule and update_rule != "RESTRICT":
            extra += f" ON UPDATE {update_rule}"
        spec["extra"] = extra.strip()

    return list(specs.values())


def drop_referencing_fks(conn, database: str, table_name: str) -> tuple[list[dict], list[Issue]]:
    """Remove (ALTER TABLE ... DROP FOREIGN KEY) toda FK de outras tabelas que
    referencia table_name, para permitir recriá-la. Retorna os fk_specs (para
    tentar restaurar depois via resolve_pending_foreign_keys) e os Issues."""
    specs = find_referencing_fks(conn, database, table_name)
    dropped: list[dict] = []
    issues: list[Issue] = []
    cursor = conn.cursor()
    for spec in specs:
        try:
            cursor.execute(
                f"ALTER TABLE `{database}`.`{spec['child_table']}` DROP FOREIGN KEY `{spec['fk_name']}`"
            )
            conn.commit()
            dropped.append(spec)
            issues.append(Issue(
                "FK_REMOVED", "warning",
                f"FOREIGN KEY `{spec['fk_name']}` em `{spec['child_table']}` (→ `{table_name}`) "
                f"removida temporariamente — uma FK órfã (de execução anterior) impedia recriar `{table_name}`",
                f"FK `{spec['fk_name']}` em `{spec['child_table']}`", "(removida)",
            ))
        except MySQLError:
            conn.rollback()
    cursor.close()
    return dropped, issues


def apply_table(conn, database: str, ddl: str) -> tuple[Optional[str], str, list[Issue], list[dict]]:
    """Cria a tabela no destino.
    Se falhar por FK sem unique key compatível na tabela referenciada, tenta duas
    estratégias de recuperação, na ordem:
      1. a própria tabela declara a FK problemática → remove-a (strip_foreign_keys)
      2. uma FK de OUTRA tabela (de execução anterior, por ex.) ainda referencia esta
         tabela e bloqueia a recriação → remove essa FK órfã (drop_referencing_fks)
    Retorna (erro|None, ddl efetivamente aplicado, issues extras, fk_specs das FKs
    removidas) — fk_specs é usado depois por resolve_pending_foreign_keys."""
    cursor = conn.cursor()
    try:
        cursor.execute(f"USE `{database}`")
        cursor.execute(ddl)
        conn.commit()
        return None, ddl, [], []
    except MySQLError as e:
        conn.rollback()
        if e.errno not in FK_ERROR_CODES:
            return str(e), ddl, [], []

        last_error = str(e)
        current_ddl = ddl
        issues: list[Issue] = []
        fk_specs: list[dict] = []

        m = re.match(r"CREATE TABLE\s+`([^`]+)`", ddl, re.IGNORECASE)
        table_name = m.group(1) if m else None

        if "FOREIGN KEY" in current_ddl.upper():
            stripped_ddl, strip_issues, strip_specs = strip_foreign_keys(current_ddl)
            if stripped_ddl != current_ddl:
                for spec in strip_specs:
                    spec["child_table"] = table_name
                try:
                    cursor.execute(stripped_ddl)
                    conn.commit()
                    return None, stripped_ddl, strip_issues, strip_specs
                except MySQLError as e2:
                    conn.rollback()
                    last_error = str(e2)
                    current_ddl = stripped_ddl
                    issues += strip_issues
                    fk_specs += strip_specs

        if table_name:
            dropped_specs, drop_issues = drop_referencing_fks(conn, database, table_name)
            if dropped_specs:
                try:
                    cursor.execute(current_ddl)
                    conn.commit()
                    return None, current_ddl, issues + drop_issues, fk_specs + dropped_specs
                except MySQLError as e3:
                    conn.rollback()
                    last_error = str(e3)
                    issues += drop_issues
                    fk_specs += dropped_specs

        return last_error, ddl, issues, fk_specs
    finally:
        cursor.close()


def resolve_pending_foreign_keys(conn, database: str, pending_fks: list[dict]) -> list[dict]:
    """Para cada FK removida na criação das tabelas, tenta restaurá-la agora que os
    dados já foram carregados:
      1. verifica se a coluna referenciada no pai está livre de duplicados
      2. se estiver, cria uma UNIQUE KEY nela
      3. recria a FK original (FOREIGN_KEY_CHECKS já deve estar em 0 nesse ponto,
         então dados órfãos pré-existentes não bloqueiam a criação da constraint)
    Retorna uma lista de dicts com o desfecho de cada FK."""
    results = []
    cursor = conn.cursor()
    try:
        cursor.execute(f"USE `{database}`")
    except MySQLError:
        pass

    for fk in pending_fks:
        fk_name     = fk["fk_name"]
        child_table = fk["child_table"]
        child_cols  = fk["child_cols"]
        ref_table   = fk["ref_table"]
        ref_cols    = fk["ref_cols"]
        extra       = fk.get("extra", "")

        outcome = {"fk_name": fk_name, "child_table": child_table,
                   "ref_table": ref_table, "restored": False, "detail": ""}

        ref_col_list    = ", ".join(f"`{c}`" for c in ref_cols)
        not_null_clause = " AND ".join(f"`{c}` IS NOT NULL" for c in ref_cols)

        try:
            cursor.execute(
                f"SELECT {ref_col_list} FROM `{database}`.`{ref_table}` "
                f"WHERE {not_null_clause} GROUP BY {ref_col_list} HAVING COUNT(*) > 1 LIMIT 1"
            )
            dup = cursor.fetchone()
        except MySQLError as e:
            outcome["detail"] = f"Não foi possível checar duplicidade em `{ref_table}`: {e}"
            results.append(outcome)
            continue

        if dup:
            outcome["detail"] = (
                f"`{ref_table}` tem valores duplicados em ({ref_col_list}) — ex.: {dup} "
                f"— não é seguro criar UNIQUE KEY; FK não restaurada"
            )
            results.append(outcome)
            continue

        uk_name = f"uk_{ref_table}_{'_'.join(ref_cols)}"[:64]
        try:
            cursor.execute(
                f"ALTER TABLE `{database}`.`{ref_table}` ADD UNIQUE KEY `{uk_name}` ({ref_col_list})"
            )
            conn.commit()
        except MySQLError as e:
            conn.rollback()
            outcome["detail"] = f"Falha ao criar UNIQUE KEY em `{ref_table}`: {e}"
            results.append(outcome)
            continue

        child_col_list = ", ".join(f"`{c}`" for c in child_cols)
        try:
            cursor.execute(
                f"ALTER TABLE `{database}`.`{child_table}` "
                f"ADD CONSTRAINT `{fk_name}` FOREIGN KEY ({child_col_list}) "
                f"REFERENCES `{database}`.`{ref_table}` ({ref_col_list}) {extra}"
            )
            conn.commit()
            outcome["restored"] = True
            outcome["detail"] = f"UNIQUE KEY `{uk_name}` criada em `{ref_table}` e FK restaurada"
        except MySQLError as e:
            conn.rollback()
            outcome["detail"] = (
                f"UNIQUE KEY `{uk_name}` criada em `{ref_table}`, mas a FK não pôde ser "
                f"restaurada: {e}"
            )

        results.append(outcome)

    cursor.close()
    return results


def copy_table_data(src_conn, dst_conn, src_db: str, dst_db: str,
                    table_name: str, where_clause: Optional[str] = None) -> tuple[int, Optional[str]]:
    """Copia dados da tabela em batches de BATCH_SIZE linhas.
    Se where_clause for informado, aplica como filtro (SELECT ... WHERE where_clause).
    Retorna (total_linhas_inseridas, erro|None)."""
    try:
        cur_src = src_conn.cursor()
        select_sql = f"SELECT * FROM `{src_db}`.`{table_name}`"
        if where_clause:
            select_sql += f" WHERE {where_clause}"
        cur_src.execute(select_sql)
        columns = [d[0] for d in cur_src.description]
        col_list = ", ".join(f"`{c}`" for c in columns)
        placeholders = ", ".join(["%s"] * len(columns))
        insert_sql = (
            f"INSERT INTO `{dst_db}`.`{table_name}` ({col_list}) VALUES ({placeholders})"
        )

        cur_dst = dst_conn.cursor()
        total = 0

        if HAS_RICH:
            with Progress(SpinnerColumn(), TextColumn("{task.description}"),
                          TextColumn("[cyan]{task.completed}[/cyan] linhas"), transient=True) as prog:
                task = prog.add_task(f"  {table_name}", total=None)
                while True:
                    batch = cur_src.fetchmany(BATCH_SIZE)
                    if not batch:
                        break
                    cur_dst.executemany(insert_sql, batch)
                    dst_conn.commit()
                    total += len(batch)
                    prog.update(task, completed=total)
        else:
            while True:
                batch = cur_src.fetchmany(BATCH_SIZE)
                if not batch:
                    break
                cur_dst.executemany(insert_sql, batch)
                dst_conn.commit()
                total += len(batch)
                print(f"  {table_name}: {total} linhas copiadas...", end="\r")
            if total:
                print()

        cur_src.close()
        cur_dst.close()
        return total, None
    except Exception as e:
        try:
            dst_conn.rollback()
        except Exception:
            pass
        return 0, str(e)


# ─────────────────────────────────────────────────────────────
# RELATÓRIO
# ─────────────────────────────────────────────────────────────

def print_summary_table(results: list[dict]):
    if not HAS_RICH:
        for r in results:
            status = "OK" if r["applied"] else "ERRO"
            print(f"  [{status}] {r['type']:<10} {r['name']:<40} issues={len(r['issues'])}")
        return

    table = Table(title="Resultado — Rotinas", show_lines=True)
    table.add_column("Tipo",    style="cyan",    width=12)
    table.add_column("Nome",    style="bold",    width=40)
    table.add_column("Status",  width=10)
    table.add_column("Issues",  width=8,  justify="right")
    table.add_column("Obs",     width=40)

    for r in results:
        if r["applied"]:
            status = "[green]✔ OK[/green]"
        elif r.get("skipped"):
            status = "[dim]— skip[/dim]"
        else:
            status = "[red]✘ ERRO[/red]"

        n_errors   = sum(1 for i in r["issues"] if i.severity == "error")
        n_warnings = sum(1 for i in r["issues"] if i.severity == "warning")
        issues_str = ""
        if n_errors:   issues_str += f"[red]{n_errors}E[/red] "
        if n_warnings: issues_str += f"[yellow]{n_warnings}W[/yellow]"
        if not issues_str: issues_str = "[dim]—[/dim]"

        obs = r.get("apply_error") or ""
        if len(obs) > 38:
            obs = obs[:35] + "..."

        table.add_row(r["type"], r["name"], status, issues_str, obs)

    console.print(table)


def print_table_summary(table_results: list[dict]):
    if not HAS_RICH:
        for r in table_results:
            status = "OK" if r["applied"] else ("SKIP" if r.get("skipped") else "ERRO")
            mode   = r.get("mode", "schema")
            rows   = f" ({r.get('rows_copied', 0)} linhas)" if mode == "full" else ""
            print(f"  [{status}] {r['name']:<45} {mode}{rows}")
        return

    tbl = Table(title="Resultado — Tabelas", show_lines=True)
    tbl.add_column("Tabela",  style="bold",  width=45)
    tbl.add_column("Engine",  width=10)
    tbl.add_column("Modo",    width=8)
    tbl.add_column("Status",  width=10)
    tbl.add_column("Issues",  width=8,  justify="right")
    tbl.add_column("Linhas",  width=10, justify="right")
    tbl.add_column("Obs",     width=30)

    for r in table_results:
        if r["applied"]:
            status = "[green]✔ OK[/green]"
        elif r.get("skipped"):
            status = "[dim]— skip[/dim]"
        else:
            status = "[red]✘ ERRO[/red]"

        n_errors   = sum(1 for i in r["issues"] if i.severity == "error")
        n_warnings = sum(1 for i in r["issues"] if i.severity == "warning")
        issues_str = ""
        if n_errors:   issues_str += f"[red]{n_errors}E[/red] "
        if n_warnings: issues_str += f"[yellow]{n_warnings}W[/yellow]"
        if not issues_str: issues_str = "[dim]—[/dim]"

        mode = r.get("mode", "schema")
        rows_copied = str(r.get("rows_copied", "—")) if mode == "full" else "—"

        obs = r.get("apply_error") or r.get("copy_error") or ""
        if len(obs) > 28:
            obs = obs[:25] + "..."

        tbl.add_row(
            r["name"],
            r.get("engine") or "—",
            mode,
            status,
            issues_str,
            rows_copied,
            obs,
        )

    console.print(tbl)


def render_html_report(data: dict) -> str:
    """Gera um HTML autocontido (sem dependências externas) para ler o relatório
    no navegador — basta abrir o arquivo local (duplo clique / file://)."""

    def esc(value) -> str:
        return html.escape(str(value)) if value is not None else ""

    def status_badge(applied: bool, skipped: bool) -> str:
        if applied:
            return '<span class="badge ok">OK</span>'
        if skipped:
            return '<span class="badge skip">SKIP</span>'
        return '<span class="badge err">ERRO</span>'

    def issues_cell(issues: list[dict]) -> str:
        if not issues:
            return '<span class="muted">—</span>'
        counts = {"error": 0, "warning": 0, "info": 0}
        for i in issues:
            counts[i["severity"]] = counts.get(i["severity"], 0) + 1
        summary = " ".join(
            f'<span class="badge {cls}">{counts[sev]}{letter}</span>'
            for sev, cls, letter in (("error", "err", "E"), ("warning", "warn", "A"), ("info", "info", "I"))
            if counts[sev]
        )
        items = "".join(
            f'<li class="issue-{esc(i["severity"])}"><b>{esc(i["code"])}</b> — {esc(i["description"])}</li>'
            for i in issues
        )
        return f'<details><summary>{summary}</summary><ul class="issue-list">{items}</ul></details>'

    def error_cell(*errs: Optional[str]) -> str:
        parts = [e for e in errs if e]
        if not parts:
            return '<span class="muted">—</span>'
        return "<br>".join(f'<span class="err-text">{esc(p)}</span>' for p in parts)

    def table_rows(items: list[dict]) -> str:
        out = []
        for r in items:
            name = esc(r["name"])
            out.append(
                f'<tr data-name="{name.lower()}">'
                f'<td class="mono">{name}</td>'
                f'<td>{esc(r.get("engine") or "—")}</td>'
                f'<td>{esc(r.get("mode") or "schema")}</td>'
                f'<td>{status_badge(r["applied"], r.get("skipped", False))}</td>'
                f'<td class="num">{r.get("rows_copied", 0)}</td>'
                f'<td>{issues_cell(r.get("issues", []))}</td>'
                f'<td>{error_cell(r.get("apply_error"), r.get("copy_error"))}</td>'
                f'</tr>'
            )
        return "".join(out)

    def routine_rows(items: list[dict]) -> str:
        out = []
        for r in items:
            name = esc(r["name"])
            out.append(
                f'<tr data-name="{name.lower()}">'
                f'<td>{esc(r["type"])}</td>'
                f'<td class="mono">{name}</td>'
                f'<td>{status_badge(r["applied"], r.get("skipped", False))}</td>'
                f'<td>{issues_cell(r.get("issues", []))}</td>'
                f'<td>{error_cell(r.get("apply_error"))}</td>'
                f'</tr>'
            )
        return "".join(out)

    tables   = data["tables"]
    routines = data["routines"]

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de Migração — {esc(data['timestamp'])}</title>
<style>
  :root {{
    --bg: #0f1115; --panel: #171a21; --border: #2a2e37; --text: #e6e8eb; --muted: #8b93a1;
    --ok: #2ecc71; --err: #e74c3c; --warn: #f1c40f; --info: #3498db;
  }}
  @media (prefers-color-scheme: light) {{
    :root {{ --bg: #f6f7f9; --panel: #ffffff; --border: #e1e4e8; --text: #1c1f24; --muted: #5c6370; }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }}
  header {{ padding: 24px 32px; border-bottom:1px solid var(--border); }}
  header h1 {{ margin:0 0 4px; font-size:20px; }}
  header .sub {{ color:var(--muted); font-size:14px; }}
  main {{ padding: 24px 32px; max-width:1400px; margin:0 auto; }}
  .cards {{ display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px; }}
  .card {{ background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px 18px; min-width:140px; }}
  .card .num {{ font-size:24px; font-weight:700; }}
  .card .label {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }}
  .card.ok .num {{ color:var(--ok); }} .card.err .num {{ color:var(--err); }}
  input#filter {{ width:100%; max-width:420px; padding:10px 12px; margin-bottom:20px; border-radius:8px;
    border:1px solid var(--border); background:var(--panel); color:var(--text); font-size:14px; }}
  h2 {{ font-size:16px; margin: 32px 0 12px; }}
  table {{ width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; }}
  th, td {{ padding:9px 12px; border-bottom:1px solid var(--border); text-align:left; font-size:13px; vertical-align:top; }}
  th {{ color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em; }}
  tr:last-child td {{ border-bottom:none; }}
  .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  .num {{ text-align:right; }}
  .muted {{ color:var(--muted); }}
  .badge {{ display:inline-block; padding:1px 7px; border-radius:20px; font-size:11px; font-weight:600; white-space:nowrap; }}
  .badge.ok {{ background:rgba(46,204,113,.15); color:var(--ok); }}
  .badge.err {{ background:rgba(231,76,60,.15); color:var(--err); }}
  .badge.warn {{ background:rgba(241,196,15,.18); color:#b8860b; }}
  .badge.info {{ background:rgba(52,152,219,.15); color:var(--info); }}
  .badge.skip {{ background:rgba(139,147,161,.15); color:var(--muted); }}
  .err-text {{ color:var(--err); }}
  details summary {{ cursor:pointer; list-style:none; }}
  details summary::-webkit-details-marker {{ display:none; }}
  ul.issue-list {{ margin:6px 0 0; padding-left:16px; }}
  ul.issue-list li {{ margin-bottom:4px; }}
  .issue-error {{ color:var(--err); }} .issue-warning {{ color:#b8860b; }} .issue-info {{ color:var(--info); }}
  tr.hidden {{ display:none; }}
</style>
</head>
<body>
<header>
  <h1>Relatório de Migração MySQL 5 → 8</h1>
  <div class="sub">{esc(data['source_db'])} → {esc(data['destination_db'])} · {esc(data['timestamp'])}</div>
</header>
<main>
  <div class="cards">
    <div class="card"><div class="num">{tables['total']}</div><div class="label">Tabelas</div></div>
    <div class="card ok"><div class="num">{tables['applied']}</div><div class="label">Aplicadas</div></div>
    <div class="card err"><div class="num">{tables['errors']}</div><div class="label">Erros</div></div>
    <div class="card"><div class="num">{tables['skipped']}</div><div class="label">Puladas</div></div>
    <div class="card"><div class="num">{tables['rows_copied']}</div><div class="label">Linhas copiadas</div></div>
    <div class="card"><div class="num">{routines['total']}</div><div class="label">Rotinas</div></div>
    <div class="card ok"><div class="num">{routines['applied']}</div><div class="label">Aplicadas</div></div>
    <div class="card err"><div class="num">{routines['errors']}</div><div class="label">Erros</div></div>
    <div class="card"><div class="num">{routines['skipped']}</div><div class="label">Puladas</div></div>
  </div>

  <input id="filter" type="search" placeholder="Filtrar por nome...">

  <h2>Tabelas ({tables['total']})</h2>
  <table>
    <thead><tr>
      <th>Nome</th><th>Engine</th><th>Modo</th><th>Status</th><th>Linhas</th><th>Issues</th><th>Erro</th>
    </tr></thead>
    <tbody>{table_rows(tables['items'])}</tbody>
  </table>

  <h2>Rotinas ({routines['total']})</h2>
  <table>
    <thead><tr>
      <th>Tipo</th><th>Nome</th><th>Status</th><th>Issues</th><th>Erro</th>
    </tr></thead>
    <tbody>{routine_rows(routines['items'])}</tbody>
  </table>
</main>
<script>
document.getElementById('filter').addEventListener('input', function (e) {{
  var q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('tbody tr').forEach(function (tr) {{
    tr.classList.toggle('hidden', Boolean(q) && !tr.dataset.name.includes(q));
  }});
}});
</script>
</body>
</html>"""


def save_report(routine_results: list[dict], src_db: str, dst_db: str,
                table_results: Optional[list[dict]] = None) -> Path:
    """Salva relatório JSON + SQL."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = Path(f"migration_report_{ts}")
    report_dir.mkdir(exist_ok=True)

    table_results = table_results or []

    # ── JSON ──
    report_data = {
        "timestamp": ts,
        "source_db": src_db,
        "destination_db": dst_db,
        "routines": {
            "total":   len(routine_results),
            "applied": sum(1 for r in routine_results if r["applied"]),
            "errors":  sum(1 for r in routine_results if not r["applied"] and not r.get("skipped")),
            "skipped": sum(1 for r in routine_results if r.get("skipped")),
            "items": [
                {
                    "name": r["name"],
                    "type": r["type"],
                    "applied": r["applied"],
                    "skipped": r.get("skipped", False),
                    "apply_error": r.get("apply_error"),
                    "issues": [
                        {"code": i.code, "severity": i.severity, "description": i.description}
                        for i in r["issues"]
                    ],
                }
                for r in routine_results
            ],
        },
        "tables": {
            "total":       len(table_results),
            "applied":     sum(1 for r in table_results if r["applied"]),
            "errors":      sum(1 for r in table_results if not r["applied"] and not r.get("skipped")),
            "skipped":     sum(1 for r in table_results if r.get("skipped")),
            "rows_copied": sum(r.get("rows_copied", 0) for r in table_results),
            "items": [
                {
                    "name":        r["name"],
                    "engine":      r.get("engine"),
                    "mode":        r.get("mode", "schema"),
                    "applied":     r["applied"],
                    "skipped":     r.get("skipped", False),
                    "rows_copied": r.get("rows_copied", 0),
                    "apply_error": r.get("apply_error"),
                    "copy_error":  r.get("copy_error"),
                    "issues": [
                        {"code": i.code, "severity": i.severity, "description": i.description}
                        for i in r["issues"]
                    ],
                }
                for r in table_results
            ],
        },
    }
    json_path = report_dir / "report.json"
    json_path.write_text(json.dumps(report_data, ensure_ascii=False, indent=2))

    # ── HTML (leitura amigável no navegador) ──
    html_path = report_dir / "report.html"
    html_path.write_text(render_html_report(report_data), encoding="utf-8")

    # ── SQL com DDLs corrigidos ──
    sql_path = report_dir / "migration.sql"
    lines = [
        f"-- Migração MySQL 5 → 8  |  {ts}",
        f"-- Origem: {src_db}  →  Destino: {dst_db}",
        f"-- Gerado por migrate_routines.py",
        "",
        f"USE `{dst_db}`;",
        "SET FOREIGN_KEY_CHECKS=0;",
        "",
    ]

    if table_results:
        lines.append("-- ════════════════════════════════")
        lines.append("-- TABELAS")
        lines.append("-- ════════════════════════════════")
        lines.append("")
        for r in table_results:
            lines.append(f"-- ── TABLE: {r['name']} ──")
            if r.get("issues"):
                for iss in r["issues"]:
                    lines.append(f"-- [{iss.severity.upper()}] {iss.code}: {iss.description}")
            if r.get("ddl_fixed"):
                lines.append(f"DROP TABLE IF EXISTS `{r['name']}`;")
                lines.append(r["ddl_fixed"] + ";")
            elif r.get("extract_error"):
                lines.append(f"-- ERRO AO EXTRAIR: {r['extract_error']}")
            lines.append("")

    if routine_results:
        lines.append("-- ════════════════════════════════")
        lines.append("-- ROTINAS")
        lines.append("-- ════════════════════════════════")
        lines.append("")
        for r in routine_results:
            lines.append(f"-- ── {r['type']}: {r['name']} ──")
            if r.get("issues"):
                for iss in r["issues"]:
                    lines.append(f"-- [{iss.severity.upper()}] {iss.code}: {iss.description}")
            if r.get("ddl_fixed"):
                lines.append(r["ddl_fixed"] + ";")
            elif r.get("extract_error"):
                lines.append(f"-- ERRO AO EXTRAIR: {r['extract_error']}")
            lines.append("")

    lines.append("SET FOREIGN_KEY_CHECKS=1;")
    sql_path.write_text("\n".join(lines), encoding="utf-8")

    # ── SQL só com erros de rotinas (para reprocessar) ──
    failed_routines = [r for r in routine_results if not r["applied"] and not r.get("skipped") and r.get("ddl_fixed")]
    if failed_routines:
        retry_path = report_dir / "retry_routines.sql"
        retry_lines = [f"USE `{dst_db}`;\n"]
        for r in failed_routines:
            retry_lines.append(f"-- {r['type']}: {r['name']}")
            retry_lines.append(f"-- ERRO: {r.get('apply_error', '')}")
            retry_lines.append(r["ddl_fixed"] + ";")
            retry_lines.append("")
        retry_path.write_text("\n".join(retry_lines), encoding="utf-8")

    # ── SQL só com erros de tabelas (para reprocessar) ──
    failed_tables = [r for r in table_results if not r["applied"] and not r.get("skipped") and r.get("ddl_fixed")]
    if failed_tables:
        retry_path = report_dir / "retry_tables.sql"
        retry_lines = [f"USE `{dst_db}`;\nSET FOREIGN_KEY_CHECKS=0;\n"]
        for r in failed_tables:
            retry_lines.append(f"-- TABLE: {r['name']}")
            retry_lines.append(f"-- ERRO: {r.get('apply_error', '')}")
            retry_lines.append(f"DROP TABLE IF EXISTS `{r['name']}`;")
            retry_lines.append(r["ddl_fixed"] + ";")
            retry_lines.append("")
        retry_lines.append("SET FOREIGN_KEY_CHECKS=1;")
        retry_path.write_text("\n".join(retry_lines), encoding="utf-8")

    return report_dir


# ─────────────────────────────────────────────────────────────
# FLUXO PRINCIPAL
# ─────────────────────────────────────────────────────────────

def main():
    if HAS_RICH:
        console.print(Panel.fit(
            "[bold cyan]MySQL 5 → 8  |  Migração de Tabelas, Procedures & Functions[/bold cyan]\n"
            "[dim]Remove DEFINER · Corrige incompatibilidades · Copia dados · Gera relatório[/dim]",
            border_style="cyan"
        ))
    else:
        print("\n=== MySQL 5 → 8 | Migração MySQL ===\n")

    # ── 1. Conexões ──
    conn_src, src_params = ask_connection(
        "ORIGEM (MySQL 5)", {"host": "127.0.0.1", "port": 3306}, cfg_prefix="source"
    )
    if not conn_src:
        error("Não foi possível conectar à origem. Abortando.")
        sys.exit(1)

    conn_dst, dst_params = ask_connection(
        "DESTINO (MySQL 8)", {"host": "127.0.0.1", "port": 3307}, cfg_prefix="destination"
    )
    if not conn_dst:
        error("Não foi possível conectar ao destino. Abortando.")
        sys.exit(1)

    SRC_LABEL = "ORIGEM (MySQL 5)"
    DST_LABEL = "DESTINO (MySQL 8)"

    src_db = conn_src.database
    dst_db = conn_dst.database

    # ── 2. O que migrar? ──
    header("O que deseja migrar?")
    migrate_routines_flag = cfg_confirm("migrate_routines", "Migrar procedures e functions?", default=True)
    migrate_tables_flag   = cfg_confirm("migrate_tables",   "Migrar tabelas?",                default=True)

    if not migrate_routines_flag and not migrate_tables_flag:
        warn("Nada selecionado para migrar. Encerrando.")
        sys.exit(0)

    # ── 3. DEFINER (apenas para rotinas) ──
    new_definer = None
    if migrate_routines_flag:
        header("Configuração do DEFINER")
        info("O DEFINER original será removido por padrão.")
        cfg_new_definer = cfg("new_definer")
        if cfg_new_definer is not None:
            new_definer = cfg_new_definer or None
            info(f"[config] Novo DEFINER: {new_definer or '(remover, sem substituto)'}")
        elif confirm("Deseja definir um novo DEFINER para todas as rotinas?", default=False):
            new_definer = ask("Novo DEFINER (ex: `root`@`%`)", "`root`@`%`")

    # ══════════════════════════════════════════════════════════
    # BLOCO — ROTINAS
    # ══════════════════════════════════════════════════════════
    routine_results: list[dict] = []

    if migrate_routines_flag:
        # ── Extração ──
        conn_src = ensure_connected(conn_src, SRC_LABEL, src_params)
        if conn_src is None:
            error("Sem conexão com a origem. Abortando.")
            sys.exit(1)
        header("Extraindo rotinas da origem")
        if HAS_RICH:
            with Progress(SpinnerColumn(), TextColumn("{task.description}"), transient=True) as prog:
                prog.add_task("Lendo procedures e functions...", total=None)
                routines = fetch_routines(conn_src, src_db)
        else:
            routines = fetch_routines(conn_src, src_db)

        if not routines:
            warn("Nenhuma rotina encontrada na origem.")
        else:
            info(f"Encontradas {len(routines)} rotinas: "
                 f"{sum(1 for r in routines if r['type']=='PROCEDURE')} procedures, "
                 f"{sum(1 for r in routines if r['type']=='FUNCTION')} functions")

            # ── Seleção ──
            header("Seleção de rotinas")
            if HAS_RICH:
                tbl = Table(show_header=True)
                tbl.add_column("#",       width=4,  justify="right")
                tbl.add_column("Tipo",    width=12)
                tbl.add_column("Nome",    width=50)
                tbl.add_column("Definer", width=30)
                for i, r in enumerate(routines, 1):
                    tbl.add_row(str(i), r["type"], r["name"], r.get("definer", ""))
                console.print(tbl)

            selected_routine_idx = select_items(routines, "routines.select", "rotina")

            # ── Preview de problemas ──
            header("Análise de compatibilidade — rotinas")
            preview_issues: dict[str, list[Issue]] = {}
            for i in selected_routine_idx:
                ddl = routines[i].get("ddl_original")
                if ddl:
                    _, issues = transform_routine(ddl, new_definer)
                    if issues:
                        preview_issues[routines[i]["name"]] = issues

            if preview_issues:
                n_err = sum(1 for v in preview_issues.values() for i in v if i.severity == "error")
                n_wrn = sum(1 for v in preview_issues.values() for i in v if i.severity == "warning")
                if HAS_RICH:
                    console.print(f"  [red]{n_err} erro(s)[/red]  [yellow]{n_wrn} aviso(s)[/yellow]  detectados.")
                else:
                    print(f"  {n_err} erro(s)  {n_wrn} aviso(s)  detectados.")
                if cfg_confirm("routines.view_compatibility_details", "Ver detalhes antes de continuar?", default=True):
                    for name, issues in preview_issues.items():
                        if HAS_RICH:
                            console.print(f"\n  [bold]{name}[/bold]")
                        else:
                            print(f"\n  {name}")
                        for iss in issues:
                            color = "red" if iss.severity == "error" else "yellow"
                            if HAS_RICH:
                                console.print(f"    [{color}]{iss.severity.upper()}[/{color}]  {iss.code}: {iss.description}")
                            else:
                                print(f"    {iss.severity.upper()}  {iss.code}: {iss.description}")
            else:
                ok("Nenhum problema de compatibilidade detectado nas rotinas.")

            # ── Aplicação ──
            header("Aplicando rotinas no destino")
            if cfg_confirm("routines.apply", f"Aplicar {len(selected_routine_idx)} rotina(s) em [{dst_db}]?", default=True):
                drop_existing = cfg_confirm(
                    "routines.drop_existing", "Dropar rotinas existentes no destino antes de criar?", default=True
                )

                conn_dst = ensure_connected(conn_dst, DST_LABEL, dst_params)
                if conn_dst is None:
                    error("Sem conexão com o destino. Abortando aplicação de rotinas.")
                    sys.exit(1)

                for i in selected_routine_idx:
                    r = routines[i]
                    ddl_orig = r.get("ddl_original")
                    result = {
                        "name":         r["name"],
                        "type":         r["type"],
                        "definer":      r.get("definer", ""),
                        "applied":      False,
                        "skipped":      False,
                        "issues":       [],
                        "ddl_original": ddl_orig,
                        "ddl_fixed":    None,
                        "apply_error":  None,
                        "extract_error": r.get("extract_error"),
                    }

                    if not ddl_orig:
                        result["skipped"] = True
                        result["apply_error"] = f"DDL indisponível: {r.get('extract_error', 'desconhecido')}"
                        routine_results.append(result)
                        warn(f"Pulando {r['type']} [{r['name']}] — DDL indisponível")
                        continue

                    ddl_fixed, issues = transform_routine(ddl_orig, new_definer)
                    ddl_fixed = normalize_delimiter(ddl_fixed, r["name"], r["type"])
                    result["issues"]    = issues
                    result["ddl_fixed"] = ddl_fixed

                    if drop_existing:
                        drop_if_exists(conn_dst, dst_db, r["name"], r["type"])

                    err = apply_routine(conn_dst, dst_db, ddl_fixed)
                    if err:
                        result["apply_error"] = err
                        error(f"{r['type']} [{r['name']}] — ERRO: {err[:80]}")
                    else:
                        result["applied"] = True
                        ok(f"{r['type']} [{r['name']}]")

                    routine_results.append(result)
            else:
                warn("Aplicação de rotinas cancelada.")

    # ══════════════════════════════════════════════════════════
    # BLOCO — TABELAS
    # ══════════════════════════════════════════════════════════
    table_results: list[dict] = []

    if migrate_tables_flag:
        # ── Extração ──
        conn_src = ensure_connected(conn_src, SRC_LABEL, src_params)
        if conn_src is None:
            error("Sem conexão com a origem. Abortando.")
            sys.exit(1)
        header("Extraindo tabelas da origem")
        if HAS_RICH:
            with Progress(SpinnerColumn(), TextColumn("{task.description}"), transient=True) as prog:
                prog.add_task("Lendo tabelas...", total=None)
                tables = fetch_tables(conn_src, src_db)
        else:
            tables = fetch_tables(conn_src, src_db)

        if not tables:
            warn("Nenhuma tabela encontrada na origem.")
        else:
            info(f"Encontradas {len(tables)} tabela(s).")

            # ── Seleção ──
            header("Seleção de tabelas")
            if HAS_RICH:
                tbl = Table(show_header=True)
                tbl.add_column("#",        width=4,  justify="right")
                tbl.add_column("Tabela",   width=45)
                tbl.add_column("Engine",   width=10)
                tbl.add_column("~Linhas",  width=12, justify="right")
                for i, t in enumerate(tables, 1):
                    approx = str(t.get("approx_rows") or "—")
                    tbl.add_row(str(i), t["name"], t.get("engine") or "—", approx)
                console.print(tbl)

            selected_table_idx = select_items(tables, "tables.select", "tabela")

            # ── Modo: esquema ou esquema + dados ──
            header("Modo de migração das tabelas")
            copy_data = cfg_confirm(
                "tables.copy_data",
                "Copiar também os dados (INSERT INTO)? [Não = apenas esquema (CREATE TABLE)]",
                default=False,
            )
            mode = "full" if copy_data else "schema"
            info(f"Modo selecionado: [bold]{'esquema + dados' if copy_data else 'apenas esquema'}[/bold]"
                 if HAS_RICH else
                 f"Modo: {'esquema + dados' if copy_data else 'apenas esquema'}")

            # ── Tabelas já existentes no destino (não recriar esquema)? ──
            skip_create = cfg_confirm(
                "tables.skip_create",
                "As tabelas já existem no destino (esquema já criado, ex.: InnoDB) e você "
                "quer apenas inserir dados sem recriar o esquema?",
                default=False,
            )
            force_innodb = False
            if not skip_create:
                force_innodb = cfg_confirm(
                    "tables.force_innodb",
                    "Forçar ENGINE=InnoDB nas tabelas criadas no destino "
                    "(recomendado ao migrar MyISAM → MySQL 8)?",
                    default=True,
                )

            # ── Filtros (WHERE) por tabela na cópia de dados ──
            table_filters: dict[str, str] = {}
            if copy_data:
                cfg_filters = cfg("tables.filters")
                if cfg_filters is not None:
                    table_filters = {k: v.strip() for k, v in cfg_filters.items() if v and str(v).strip()}
                    if table_filters:
                        info(f"[config] Filtros WHERE: {', '.join(f'{k}={v}' for k, v in table_filters.items())}")
                elif confirm("Deseja aplicar filtros (WHERE) em alguma tabela antes de copiar os dados?", default=False):
                    for i in selected_table_idx:
                        name = tables[i]["name"]
                        where = ask(f"Filtro WHERE para '{name}' (Enter = sem filtro, copia tudo)", default="")
                        if where and where.strip():
                            table_filters[name] = where.strip()

            # ── Preview de problemas ──
            header("Análise de compatibilidade — tabelas")
            table_preview: dict[str, list[Issue]] = {}
            if not skip_create:
                for i in selected_table_idx:
                    ddl = tables[i].get("ddl_original")
                    if ddl:
                        _, issues = transform_table_ddl(ddl, force_innodb)
                        if issues:
                            table_preview[tables[i]["name"]] = issues

            if table_preview:
                n_err = sum(1 for v in table_preview.values() for i in v if i.severity == "error")
                n_wrn = sum(1 for v in table_preview.values() for i in v if i.severity == "warning")
                if HAS_RICH:
                    console.print(f"  [red]{n_err} erro(s)[/red]  [yellow]{n_wrn} aviso(s)[/yellow]  detectados.")
                else:
                    print(f"  {n_err} erro(s)  {n_wrn} aviso(s)  detectados.")
                if cfg_confirm("tables.view_compatibility_details", "Ver detalhes antes de continuar?", default=True):
                    for name, issues in table_preview.items():
                        if HAS_RICH:
                            console.print(f"\n  [bold]{name}[/bold]")
                        else:
                            print(f"\n  {name}")
                        for iss in issues:
                            color = "red" if iss.severity == "error" else "yellow"
                            if HAS_RICH:
                                console.print(f"    [{color}]{iss.severity.upper()}[/{color}]  {iss.code}: {iss.description}")
                            else:
                                print(f"    {iss.severity.upper()}  {iss.code}: {iss.description}")
            else:
                ok("Nenhum problema de compatibilidade detectado nas tabelas.")

            # ── Aplicação ──
            header("Aplicando tabelas no destino")
            if cfg_confirm("tables.apply", f"Aplicar {len(selected_table_idx)} tabela(s) em [{dst_db}]?", default=True):
                drop_existing_tables = False
                if not skip_create:
                    drop_existing_tables = cfg_confirm(
                        "tables.drop_existing", "Dropar tabelas existentes no destino antes de criar?", default=True
                    )

                conn_src = ensure_connected(conn_src, SRC_LABEL, src_params)
                conn_dst = ensure_connected(conn_dst, DST_LABEL, dst_params)
                if conn_src is None or conn_dst is None:
                    error("Sem conexão com origem/destino. Abortando aplicação de tabelas.")
                    sys.exit(1)

                # FK checks desativados durante toda a migração de tabelas
                try:
                    _cur = conn_dst.cursor()
                    _cur.execute("SET FOREIGN_KEY_CHECKS=0")
                    _cur.close()
                except Exception:
                    pass

                pending_fks: list[dict] = []

                for i in selected_table_idx:
                    # Migrações longas (muitas tabelas / muitos dados) podem deixar a
                    # conexão ociosa tempo suficiente para o servidor derrubá-la.
                    conn_src = ensure_connected(conn_src, SRC_LABEL, src_params)
                    conn_dst = ensure_connected(conn_dst, DST_LABEL, dst_params)
                    if conn_src is None or conn_dst is None:
                        error("Conexão perdida e não foi possível reconectar. Interrompendo migração de tabelas.")
                        break

                    t = tables[i]
                    ddl_orig = t.get("ddl_original")
                    result = {
                        "name":         t["name"],
                        "engine":       t.get("engine"),
                        "approx_rows":  t.get("approx_rows", 0),
                        "mode":         mode,
                        "applied":      False,
                        "skipped":      False,
                        "issues":       [],
                        "ddl_original": ddl_orig,
                        "ddl_fixed":    None,
                        "apply_error":  None,
                        "rows_copied":  0,
                        "copy_error":   None,
                        "extract_error": t.get("extract_error"),
                    }

                    if skip_create:
                        # Não recria o esquema — assume que a tabela já existe no destino.
                        result["applied"] = True
                    else:
                        if not ddl_orig:
                            result["skipped"] = True
                            result["apply_error"] = f"DDL indisponível: {t.get('extract_error', 'desconhecido')}"
                            table_results.append(result)
                            warn(f"Pulando tabela [{t['name']}] — DDL indisponível")
                            continue

                        ddl_fixed, issues = transform_table_ddl(ddl_orig, force_innodb)
                        result["issues"]    = issues
                        result["ddl_fixed"] = ddl_fixed.strip().rstrip(";")

                        if drop_existing_tables:
                            drop_table_if_exists(conn_dst, dst_db, t["name"])

                        err, applied_ddl, fk_issues, fk_specs = apply_table(conn_dst, dst_db, result["ddl_fixed"])
                        if fk_issues:
                            result["issues"] = result["issues"] + fk_issues
                            result["ddl_fixed"] = applied_ddl
                        if err:
                            result["apply_error"] = err
                            error(f"Tabela [{t['name']}] — ERRO DDL: {err[:80]}")
                            table_results.append(result)
                            continue
                        if fk_issues:
                            warn(f"Tabela [{t['name']}] criada sem {len(fk_issues)} FK(s) — "
                                 f"tabela referenciada sem unique key compatível ou FK órfã removida")
                            pending_fks.extend(fk_specs)

                        result["applied"] = True

                    # ── Cópia de dados ──
                    if copy_data:
                        where_clause = table_filters.get(t["name"])
                        filter_msg = f" (filtro: {where_clause})" if where_clause else ""
                        info(f"  Copiando dados: {t['name']}{filter_msg}...")
                        rows_copied, copy_err = copy_table_data(
                            conn_src, conn_dst, src_db, dst_db, t["name"], where_clause
                        )
                        result["rows_copied"] = rows_copied
                        result["copy_error"]  = copy_err
                        if copy_err:
                            warn(f"Tabela [{t['name']}] — erro ao copiar dados: {copy_err[:80]}")
                        else:
                            ok(f"Tabela [{t['name']}] — {rows_copied} linha(s) copiada(s)")
                    else:
                        ok(f"Tabela [{t['name']}] — esquema criado")

                    table_results.append(result)

                # ── Restauração de FKs removidas (agora com os dados já carregados) ──
                if pending_fks:
                    header("Restaurando foreign keys removidas")
                    if cfg_confirm(
                        "tables.restore_removed_fks",
                        f"Foram removidas {len(pending_fks)} FK(s) por falta de unique key na "
                        f"tabela referenciada. Tentar identificar a unique key e restaurar as "
                        f"FKs agora que os dados foram carregados?",
                        default=True,
                    ):
                        conn_dst = ensure_connected(conn_dst, DST_LABEL, dst_params)
                        if conn_dst is None:
                            error("Sem conexão com o destino — não foi possível tentar restaurar as FKs.")
                        else:
                            fk_results = resolve_pending_foreign_keys(conn_dst, dst_db, pending_fks)
                            for fkr in fk_results:
                                target = next((r for r in table_results if r["name"] == fkr["child_table"]), None)
                                if fkr["restored"]:
                                    ok(f"FK `{fkr['fk_name']}` restaurada em [{fkr['child_table']}] — {fkr['detail']}")
                                    code, sev = "FK_RESTORED", "info"
                                else:
                                    warn(f"FK `{fkr['fk_name']}` em [{fkr['child_table']}] — {fkr['detail']}")
                                    code, sev = "FK_NOT_RESTORED", "warning"
                                if target is not None:
                                    target["issues"].append(Issue(
                                        code, sev, fkr["detail"],
                                        f"FK `{fkr['fk_name']}` removida", fkr["detail"],
                                    ))

                # Reativa FK checks
                try:
                    _cur = conn_dst.cursor()
                    _cur.execute("SET FOREIGN_KEY_CHECKS=1")
                    conn_dst.commit()
                    _cur.close()
                except Exception:
                    pass
            else:
                warn("Aplicação de tabelas cancelada.")

    # ══════════════════════════════════════════════════════════
    # RESUMO GERAL
    # ══════════════════════════════════════════════════════════
    header("Resumo")

    if routine_results:
        print_summary_table(routine_results)
        n_ok   = sum(1 for r in routine_results if r["applied"])
        n_err  = sum(1 for r in routine_results if not r["applied"] and not r.get("skipped"))
        n_skip = sum(1 for r in routine_results if r.get("skipped"))
        if HAS_RICH:
            console.print(
                f"  Rotinas — Total: {len(routine_results)}  |  "
                f"[green]OK: {n_ok}[/green]  |  "
                f"[red]Erro: {n_err}[/red]  |  "
                f"[dim]Pulados: {n_skip}[/dim]"
            )
        else:
            print(f"Rotinas — Total: {len(routine_results)}  OK: {n_ok}  Erro: {n_err}  Pulados: {n_skip}")

    if table_results:
        print_table_summary(table_results)
        n_ok   = sum(1 for r in table_results if r["applied"])
        n_err  = sum(1 for r in table_results if not r["applied"] and not r.get("skipped"))
        n_skip = sum(1 for r in table_results if r.get("skipped"))
        n_rows = sum(r.get("rows_copied", 0) for r in table_results)
        if HAS_RICH:
            row_info = f"  |  [cyan]{n_rows} linha(s) copiada(s)[/cyan]" if n_rows else ""
            console.print(
                f"  Tabelas  — Total: {len(table_results)}  |  "
                f"[green]OK: {n_ok}[/green]  |  "
                f"[red]Erro: {n_err}[/red]  |  "
                f"[dim]Pulados: {n_skip}[/dim]{row_info}"
            )
        else:
            print(f"Tabelas  — Total: {len(table_results)}  OK: {n_ok}  Erro: {n_err}  Pulados: {n_skip}  Linhas: {n_rows}")

    # ── Relatório ──
    if cfg_confirm("save_report", "Salvar relatório em disco (JSON + HTML + SQL)?", default=True):
        report_dir = save_report(routine_results, src_db, dst_db, table_results)
        ok(f"Relatório salvo em: {report_dir}/")
        info(f"  • {report_dir}/report.html      — abra no navegador para leitura")
        info(f"  • {report_dir}/report.json      — relatório completo")
        info(f"  • {report_dir}/migration.sql    — DDLs corrigidos (tabelas + rotinas)")
        if any(not r["applied"] and not r.get("skipped") for r in routine_results):
            info(f"  • {report_dir}/retry_routines.sql — rotinas com erro")
        if any(not r["applied"] and not r.get("skipped") for r in table_results):
            info(f"  • {report_dir}/retry_tables.sql   — tabelas com erro")

    # ── DDL interativo para erros de rotinas ──
    failed = [r for r in routine_results if not r["applied"] and not r.get("skipped")]
    if failed and cfg_confirm("view_failed_routine_ddl", f"Ver DDL corrigido das {len(failed)} rotina(s) com erro?", default=False):
        for r in failed:
            if HAS_RICH:
                console.print(f"\n[bold red]{r['type']}:[/bold red] [bold]{r['name']}[/bold]")
                console.print(f"[red]Erro:[/red] {r.get('apply_error')}")
                if r.get("ddl_fixed"):
                    console.print(Syntax(r["ddl_fixed"], "sql", theme="monokai", line_numbers=True))
            else:
                print(f"\n{r['type']}: {r['name']}")
                print(f"Erro: {r.get('apply_error')}")
                print(r.get("ddl_fixed", ""))

    conn_src.close()
    conn_dst.close()
    ok("Migração concluída.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migração interativa de rotinas e tabelas MySQL 5.x → 8.x")
    parser.add_argument(
        "--config", metavar="ARQUIVO",
        help="Arquivo JSON com respostas para pular as perguntas interativas (ver --init-config)",
    )
    parser.add_argument(
        "--init-config", metavar="ARQUIVO", nargs="?", const="migration_config.json",
        help="Gera um arquivo de configuração modelo e encerra (padrão: migration_config.json)",
    )
    args = parser.parse_args()

    if args.init_config:
        write_config_template(args.init_config)
        sys.exit(0)

    if args.config:
        CONFIG = load_config(args.config)

    main()
