# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`migrate_routines.py` is an interactive CLI tool for migrating MySQL databases from 5.x to 8.x. It handles stored procedures/functions (DEFINER removal, compatibility fixes) and tables (schema-only or schema + data copy), generating full migration reports.

## Running the Tool

```bash
# Install dependencies
pip install mysql-connector-python rich

# Run the migration tool
python migrate_routines.py
```

The tool is fully interactive — it prompts for source and destination connection details at runtime. Every prompt can optionally be pre-answered via a JSON config file (see **Config file** below) to skip the interactive back-and-forth on repeat runs.

```bash
# Generate a template with every answerable field
python migrate_routines.py --init-config migration_config.json

# Run using it (any field left out is still asked interactively)
python migrate_routines.py --config migration_config.json
```

## Architecture

The script is organized into six functional sections:

1. **Output helpers** (`info`, `ok`, `warn`, `error`, `header`, `ask`, `confirm`) — thin wrappers that delegate to `rich` when available, falling back to plain `print`/`input`. `HAS_RICH` controls this at module level.

   **Config file** (`CONFIG`, `load_config`, `cfg`, `cfg_ask`, `cfg_confirm`, `select_items`, `write_config_template`) — `cfg_ask`/`cfg_confirm` are drop-in wrappers around `ask`/`confirm`: they look up a dotted key (e.g. `"tables.force_innodb"`) in the module-level `CONFIG` dict (loaded from `--config`) and only fall back to the real interactive prompt when that key is absent — so a config file can be filled in partially. `cfg(key, default)` does the raw dotted-path lookup. `select_items(items, cfg_key, label)` replaces the "migrate all? / give me comma-separated numbers" prompt for routines and tables alike — via config it takes `"all"` or an explicit list of exact **names** (not indices, since those shift between runs). `write_config_template(path)` (invoked by `--init-config`) emits a fully-commented (`_comment_*` keys) JSON template covering every prompt in `main()`. Every `confirm`/`ask` call inside `main()` that represents a real decision point has a corresponding `cfg.*` key — see the template for the full list.

2. **Connection** (`connect`, `ask_connection`) — interactive prompts for MySQL credentials + `mysql.connector.connect()`. Supports retry on failure. `ask_connection(label, defaults, cfg_prefix=...)` — when `cfg_prefix` is given (`"source"` / `"destination"`), each field (`host`/`port`/`user`/`password`/`database`) is resolved via `cfg_ask` first.

3. **Extraction** (`fetch_routines`) — queries `information_schema.ROUTINES` for metadata, then `SHOW CREATE PROCEDURE/FUNCTION` for the full DDL. Returns a list of dicts.

4. **Transformations** — each `fix_*` / `clean_*` function takes a DDL string and returns `(new_ddl, Issue | None)`. The `Issue` dataclass carries `code`, `severity` (`error`/`warning`/`info`), and description. All transformations are registered in `TRANSFORMATIONS` list and applied by `transform_routine()`.

   Current transformations:
   - `remove_definer` — removes or replaces `DEFINER=\`x\`@\`y\``
   - `fix_set_option` — replaces `SET OPTION` (removed in MySQL 8)
   - `fix_old_password_hash` — flags `OLD_PASSWORD()` usage
   - `clean_sql_mode` — removes `NO_AUTO_CREATE_USER` from sql_mode
   - `fix_no_zero_date` — warns about `0000-00-00` dates
   - `fix_group_concat_maxlen` — warns about `GROUP_CONCAT` without limit
   - `fix_sql_security` — warns about `SQL SECURITY DEFINER`
   - `fix_no_default_charset` — removes inline `CHARACTER SET` declarations
   - `fix_only_full_group_by` — warns about `SELECT *` with `GROUP BY`

   Table DDL has its own transformation list, `TABLE_TRANSFORMATIONS`, applied by `transform_table_ddl(ddl, force_innodb=False)`:
   - `fix_table_type_keyword` — `TYPE=Engine` → `ENGINE=Engine` (MySQL 4.x syntax)
   - `fix_table_utf8` — `utf8` → `utf8mb4`
   - `fix_table_myisam_options` — removes MyISAM-only options (`PACK_KEYS`, `DELAY_KEY_WRITE`, `CHECKSUM`)
   - `fix_table_zerofill` — flags deprecated `ZEROFILL`
   - `fix_table_int_display_width` — removes deprecated integer display width
   - `fix_table_engine_to_innodb` — converts `ENGINE=MyISAM` (or any non-InnoDB engine) to `ENGINE=InnoDB`; only applied when `force_innodb=True` is passed in (not in the static list, since it's opt-in)

5. **Application** (`drop_if_exists`, `apply_routine`) — executes the transformed DDL on the destination connection via `USE <db>; <DDL>`.

   Table migration (in `main()`) additionally supports:
   - `skip_create` — when the destination tables already exist (e.g. pre-created as InnoDB), skips DROP/CREATE entirely and only runs the data copy
   - per-table WHERE filters (`table_filters` dict) — restricts `copy_table_data`'s `SELECT * FROM table` to matching rows instead of copying the whole table
   - `apply_table` auto-recovers from MySQL 8 error 1215/6125 ("Failed to add the foreign key constraint. Missing unique key...") with two strategies, tried in order: (1) the table being created declares the offending FK itself → `strip_foreign_keys(ddl)` strips it and retries; (2) some *other* already-existing table (created earlier in this run, or left over from a previous run) has an orphaned FK still pointing at this table name → `find_referencing_fks`/`drop_referencing_fks` (queries `information_schema.KEY_COLUMN_USAGE`/`REFERENTIAL_CONSTRAINTS`) drops that FK and retries. Either way the removed FKs are captured as structured `fk_specs` dicts (`fk_name`, `child_table`, `child_cols`, `ref_table`, `ref_cols`, `extra`), not just `Issue`s, so they can be reconstructed later
   - once all tables are created and their data copied, `resolve_pending_foreign_keys(conn, database, pending_fks)` retries each removed FK: check the referenced column(s) for duplicate values, `ALTER TABLE ... ADD UNIQUE KEY` if clean, then `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` (safe because `FOREIGN_KEY_CHECKS` is still `0` at that point, so pre-existing orphan rows don't block it). Runs only if the user confirms the "Restaurando foreign keys removidas" prompt; results feed back into `table_results[...]["issues"]` as `FK_RESTORED` (info) or `FK_NOT_RESTORED` (warning)

6. **Reporting** (`print_summary_table`, `save_report`) — prints a rich table summary and writes a timestamped `migration_report_<ts>/` directory containing `report.json`, `routines_migrated.sql`, and optionally `retry_errors.sql` for failed routines.

## Adding New Transformations

To add a new MySQL 5→8 compatibility fix:

1. Write a function with signature `(ddl: str) -> tuple[str, Optional[Issue]]`
2. Return `(modified_ddl, Issue(...))` if the pattern is found, or `(ddl, None)` if not
3. Register it in the `TRANSFORMATIONS` list in the appropriate severity order (errors first)

## Key Conventions

- All user-facing output goes through the helper functions (`info`, `ok`, `warn`, `error`) — never `print()` directly in new code
- The `Issue` severity levels are `"error"` (breaks MySQL 8), `"warning"` (may cause issues), `"info"` (informational change made)
- `fetch_routines` returns raw dicts with an `"extract_error"` key when DDL extraction fails — always check for `None` DDL before transforming
- Connections are plain `mysql.connector` objects; there is no ORM or connection pool
