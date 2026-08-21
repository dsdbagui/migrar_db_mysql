#!/usr/bin/env python3
"""
fix_collation_stamp.py

Recria procedures e functions cujo DATABASE_COLLATION ainda está
carimbado como utf8mb4_unicode_ci, atualizando o carimbo para o
collation atual do banco (ex: utf8mb4_0900_ai_ci).

O banco já deve ter sido convertido para o novo collation ANTES de
executar este script. A recriação faz o MySQL carimbar automaticamente
o DATABASE_COLLATION corrente na nova definição.

Credenciais via .env (na mesma pasta do script):
  DB_HOST=127.0.0.1
  DB_PORT=3306
  DB_USER=root
  DB_PASSWORD=senha
  DB_NAME=db_formosa

Se o .env não existir, o script pergunta interativamente.

Uso:
  python fix_collation_stamp.py

Dependências:
  pip install mysql-connector-python rich
"""

import re
import sys
import os
import getpass
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
except ImportError:
    print("Instale: pip install mysql-connector-python")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.prompt import Prompt, Confirm
    from rich.syntax import Syntax
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

console = Console() if HAS_RICH else None

OLD_COLLATION = "utf8mb4_unicode_ci"


# ─────────────────────────────────────────────────────────────
# LEITURA DO .env
# ─────────────────────────────────────────────────────────────

def load_env(path: Path = Path(".env")) -> dict:
    """
    Lê um arquivo .env simples (KEY=VALUE, ignora linhas com # e vazias).
    Retorna dict com as chaves encontradas. Não sobrescreve variáveis de
    ambiente já definidas no SO.
    """
    env: dict = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # variável de ambiente do SO tem prioridade
        env[key] = os.environ.get(key, value)
    return env


# ─────────────────────────────────────────────────────────────
# HELPERS
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
# CONEXÃO
# ─────────────────────────────────────────────────────────────

def connect(host: str, port: int, user: str, password: str, database: str):
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            connection_timeout=10,
        )
        ok(f"Conectado: {user}@{host}:{port}/{database}")
        return conn
    except MySQLError as e:
        error(f"Falha ao conectar: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# CONSULTA — rotinas com collation desatualizado
# ─────────────────────────────────────────────────────────────

def find_stale_routines(conn, database: str, old_collation: str) -> list[dict]:
    """
    Retorna procedures E functions onde DATABASE_COLLATION ainda é o antigo.
    Inclui também CHARACTER_SET_CLIENT para referência.
    """
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            ROUTINE_NAME        AS name,
            ROUTINE_TYPE        AS type,
            CHARACTER_SET_CLIENT AS charset_client,
            COLLATION_CONNECTION AS collation_conn,
            DATABASE_COLLATION   AS db_collation
        FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA       = %s
          AND DATABASE_COLLATION   = %s
          AND ROUTINE_TYPE        IN ('PROCEDURE', 'FUNCTION')
        ORDER BY ROUTINE_TYPE, ROUTINE_NAME
    """, (database, old_collation))
    rows = cursor.fetchall()
    cursor.close()
    return rows


def get_current_db_collation(conn, database: str) -> str:
    """Retorna o DATABASE_COLLATION atual do banco."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
        (database,)
    )
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else "(desconhecido)"


# ─────────────────────────────────────────────────────────────
# RECRIAÇÃO
# ─────────────────────────────────────────────────────────────

def get_ddl(conn, database: str, name: str, rtype: str) -> tuple[Optional[str], Optional[str]]:
    """Retorna (ddl, erro). ddl já sem DEFINER."""
    try:
        cursor = conn.cursor()
        if rtype == "PROCEDURE":
            cursor.execute(f"SHOW CREATE PROCEDURE `{database}`.`{name}`")
        else:
            cursor.execute(f"SHOW CREATE FUNCTION `{database}`.`{name}`")
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return None, "SHOW CREATE não retornou resultado"
        ddl = row[2]  # índice 2 = corpo completo
        # Remove DEFINER para evitar erro de privilege ao recriar
        ddl = re.sub(
            r'DEFINER\s*=\s*`[^`]*`\s*@\s*`[^`]*`\s*',
            '',
            ddl,
            flags=re.IGNORECASE,
        )
        return ddl.strip().rstrip(";"), None
    except Exception as e:
        return None, str(e)


def recreate_routine(conn, database: str, name: str, rtype: str) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Drop + Create da rotina no mesmo banco.
    Retorna (sucesso, ddl_usado, erro).
    O MySQL carimba automaticamente o DATABASE_COLLATION atual do banco.
    """
    ddl, err = get_ddl(conn, database, name, rtype)
    if err:
        return False, None, f"Falha ao obter DDL: {err}"

    cursor = conn.cursor()
    try:
        # Drop
        cursor.execute(f"DROP {rtype} IF EXISTS `{database}`.`{name}`")
        conn.commit()
    except Exception as e:
        cursor.close()
        return False, ddl, f"Falha ao dropar: {e}"

    try:
        # Recreate — MySQL carimba DATABASE_COLLATION do banco atual
        cursor.execute(f"USE `{database}`")
        cursor.execute(ddl)
        conn.commit()
        cursor.close()
        return True, ddl, None
    except Exception as e:
        conn.rollback()
        cursor.close()
        return False, ddl, str(e)


# ─────────────────────────────────────────────────────────────
# RELATÓRIO
# ─────────────────────────────────────────────────────────────

def save_log(results: list[dict], database: str, old_col: str, new_col: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = Path(f"fix_collation_{database}_{ts}")
    out.mkdir(exist_ok=True)

    # JSON
    summary = {
        "timestamp": ts,
        "database": database,
        "old_collation": old_col,
        "new_collation": new_col,
        "total": len(results),
        "ok": sum(1 for r in results if r["success"]),
        "errors": sum(1 for r in results if not r["success"]),
        "routines": [
            {
                "name":    r["name"],
                "type":    r["type"],
                "success": r["success"],
                "error":   r.get("error"),
            }
            for r in results
        ],
    }
    (out / "log.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    # SQL com os DDLs recriados (útil para auditoria)
    sql_lines = [
        f"-- fix_collation_stamp.py  |  {ts}",
        f"-- Banco: {database}",
        f"-- Collation antigo: {old_col}  →  novo: {new_col}",
        "",
        f"USE `{database}`;",
        "",
    ]
    for r in results:
        sql_lines.append(f"-- {'✔' if r['success'] else '✘'}  {r['type']}: {r['name']}")
        if r.get("error"):
            sql_lines.append(f"-- ERRO: {r['error']}")
        if r.get("ddl"):
            sql_lines.append(r["ddl"] + ";")
        sql_lines.append("")
    (out / "recreated.sql").write_text("\n".join(sql_lines), encoding="utf-8")

    # SQL só com erros
    failed = [r for r in results if not r["success"] and r.get("ddl")]
    if failed:
        retry = [f"USE `{database}`;\n"]
        for r in failed:
            retry.append(f"-- ERRO: {r.get('error', '')}")
            retry.append(f"-- {r['type']}: {r['name']}")
            retry.append(r["ddl"] + ";")
            retry.append("")
        (out / "retry_errors.sql").write_text("\n".join(retry), encoding="utf-8")

    return out


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    if HAS_RICH:
        console.print(Panel.fit(
            "[bold cyan]fix_collation_stamp.py[/bold cyan]\n"
            "[dim]Recria procedures/functions com DATABASE_COLLATION desatualizado[/dim]",
            border_style="cyan",
        ))
    else:
        print("\n=== fix_collation_stamp — Atualização de collation em rotinas ===\n")

    # ── Credenciais via .env ou interativo ──
    env = load_env(Path(__file__).parent / ".env")

    if env.get("DB_HOST") or env.get("DB_USER") or env.get("DB_PASSWORD"):
        # .env encontrado — usa os valores sem perguntar
        header("Conexão MySQL (via .env)")
        host     = env.get("DB_HOST", "127.0.0.1")
        port     = int(env.get("DB_PORT", "3306"))
        user     = env.get("DB_USER", "root")
        password = env.get("DB_PASSWORD", "")
        database = env.get("DB_NAME", "db_formosa")
        info(f"Host     : {host}:{port}")
        info(f"Usuário  : {user}")
        info(f"Database : {database}")
        info(f"Senha    : {'*' * len(password) if password else '(vazia)'}")
    else:
        # .env não encontrado — modo interativo
        header("Conexão MySQL")
        warn(".env não encontrado — modo interativo (crie um .env para automatizar).")
        host     = ask("Host",     "127.0.0.1")
        port     = int(ask("Port", "3306"))
        user     = ask("Usuário",  "root")
        password = ask("Senha",    password=True)
        database = ask("Database", "db_formosa")

    conn = connect(host, port, user, password, database)
    if not conn:
        sys.exit(1)

    # ── Verifica collation atual do banco ──
    current_collation = get_current_db_collation(conn, database)
    info(f"Collation atual do banco  : [bold]{current_collation}[/bold]" if HAS_RICH
         else f"Collation atual do banco  : {current_collation}")
    info(f"Collation antigo (alvo)   : [bold]{OLD_COLLATION}[/bold]" if HAS_RICH
         else f"Collation antigo (alvo)   : {OLD_COLLATION}")

    if current_collation == OLD_COLLATION:
        warn(f"O banco ainda está com '{OLD_COLLATION}'.")
        warn("Converta o banco para o novo collation ANTES de executar este script.")
        warn("Exemplo: ALTER DATABASE `db_formosa` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;")
        sys.exit(1)

    # ── Busca rotinas desatualizadas ──
    header(f"Buscando rotinas com DATABASE_COLLATION = '{OLD_COLLATION}'")
    routines = find_stale_routines(conn, database, OLD_COLLATION)

    if not routines:
        ok(f"Nenhuma rotina encontrada com collation '{OLD_COLLATION}'. Nada a fazer.")
        conn.close()
        sys.exit(0)

    n_proc = sum(1 for r in routines if r["type"] == "PROCEDURE")
    n_func = sum(1 for r in routines if r["type"] == "FUNCTION")
    info(f"Encontradas {len(routines)} rotina(s): {n_proc} procedure(s), {n_func} function(s).")

    # ── Lista o que será recriado ──
    if HAS_RICH:
        tbl = Table(show_header=True, show_lines=False)
        tbl.add_column("#",             width=4,  justify="right")
        tbl.add_column("Tipo",          width=12, style="cyan")
        tbl.add_column("Nome",          width=50)
        tbl.add_column("Charset client",width=16)
        tbl.add_column("DB Collation",  width=24, style="yellow")
        for i, r in enumerate(routines, 1):
            tbl.add_row(str(i), r["type"], r["name"],
                        r["charset_client"] or "—", r["db_collation"])
        console.print(tbl)
    else:
        for i, r in enumerate(routines, 1):
            print(f"  {i:>3}. [{r['type']:<10}] {r['name']}")

    # ── Confirmação ──
    header("Confirmação")
    info("Cada rotina será: DROP → CREATE (sem DEFINER).")
    info(f"O MySQL carimbará automaticamente o novo collation: [bold]{current_collation}[/bold]"
         if HAS_RICH else f"Novo collation que será carimbado: {current_collation}")

    if not confirm(f"\nRecriar {len(routines)} rotina(s) em [{database}]?", default=True):
        warn("Operação cancelada.")
        conn.close()
        sys.exit(0)

    # ── Execução ──
    header("Recriando rotinas")
    results: list[dict] = []

    for r in routines:
        success, ddl, err = recreate_routine(conn, database, r["name"], r["type"])
        results.append({
            "name":    r["name"],
            "type":    r["type"],
            "success": success,
            "ddl":     ddl,
            "error":   err,
        })
        if success:
            ok(f"{r['type']:<10} {r['name']}")
        else:
            error(f"{r['type']:<10} {r['name']} — {err}")

    # ── Resumo ──
    header("Resumo")
    n_ok  = sum(1 for r in results if r["success"])
    n_err = sum(1 for r in results if not r["success"])

    if HAS_RICH:
        console.print(
            f"  Total: {len(results)}  |  "
            f"[green]OK: {n_ok}[/green]  |  "
            f"[red]Erro: {n_err}[/red]"
        )
    else:
        print(f"\nTotal: {len(results)}  OK: {n_ok}  Erro: {n_err}")

    # ── Verificação pós-recriação ──
    if n_ok:
        still_stale = find_stale_routines(conn, database, OLD_COLLATION)
        if still_stale:
            warn(f"{len(still_stale)} rotina(s) ainda com collation antigo após recriação:")
            for r in still_stale:
                warn(f"  {r['type']} {r['name']}")
        else:
            ok(f"Verificação: nenhuma rotina com '{OLD_COLLATION}' restante.")

    # ── Log ──
    if confirm("Salvar log em disco (JSON + SQL)?", default=True):
        out_dir = save_log(results, database, OLD_COLLATION, current_collation)
        ok(f"Log salvo em: {out_dir}/")
        info(f"  • {out_dir}/log.json        — resumo JSON")
        info(f"  • {out_dir}/recreated.sql   — DDLs recriados")
        if n_err:
            info(f"  • {out_dir}/retry_errors.sql — falhas para reprocessar")

    conn.close()
    ok("Concluído.")


if __name__ == "__main__":
    main()
