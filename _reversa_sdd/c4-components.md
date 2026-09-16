# C4 — Nível 3: Componentes

> Gerado pelo Architect em 2026-09-02 · Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA
> Atualizado em 2026-09-15 pelo Reversa — descrições de Connection Manager e Data Copier ampliadas para refletir o commit `971bdf5`.

## Componentes de `migrate_routines.py`

```mermaid
C4Component
    title Componentes — migrate_routines.py

    Container_Boundary(script, "migrate_routines.py") {
        Component(output, "Output Helpers", "info/ok/warn/error/header/ask/confirm", "Abstrai rich vs. print/input puro (HAS_RICH)")
        Component(config, "Config Resolver", "CONFIG, cfg, cfg_ask, cfg_confirm, select_items, write_config_template", "Resolve perguntas via --config com fallback interativo")
        Component(conn, "Connection Manager", "connect, ask_connection, ensure_connected", "Conecta/reconecta origem e destino, com retry de charset e de conexão perdida; desde 971bdf5, oferece criar o banco de destino automaticamente em erro 1049")
        Component(rext, "Routine Extractor", "fetch_routines", "Lê metadados + DDL de procedures/functions da origem")
        Component(rxform, "Routine Transformer", "remove_definer, TRANSFORMATIONS, transform_routine", "Pipeline de correção de DDL de rotinas")
        Component(rapply, "Routine Applier", "drop_if_exists, apply_routine", "Executa DDL corrigido no destino")
        Component(text, "Table Extractor", "fetch_tables", "Lê metadados + DDL de tabelas da origem")
        Component(txform, "Table Transformer", "TABLE_TRANSFORMATIONS, transform_table_ddl", "Pipeline de correção de DDL de tabelas")
        Component(fkrec, "FK Recovery Engine", "strip_foreign_keys, find_referencing_fks, drop_referencing_fks, apply_table, resolve_pending_foreign_keys", "Cria tabelas com fallback de FK e tenta restaurar depois")
        Component(datacopy, "Data Copier", "copy_table_data, _resolve_default_value, _sql_literal", "Cópia em lotes de BATCH_SIZE=500, com filtro WHERE opcional; desde 971bdf5, substitui NULL por DEFAULT configurado (tables.column_defaults) antes do INSERT")
        Component(report, "Report Generator", "print_summary_table, print_table_summary, render_html_report, save_report", "Gera report.json/html/migration.sql/retry_*.sql")
        Component(main, "Main Orchestrator", "main()", "Fluxo interativo ponta a ponta: conecta → extrai → seleciona → transforma → aplica → relatório")
    }

    Rel(main, config, "usa")
    Rel(main, conn, "usa")
    Rel(main, rext, "usa")
    Rel(main, rxform, "usa")
    Rel(main, rapply, "usa")
    Rel(main, text, "usa")
    Rel(main, txform, "usa")
    Rel(main, fkrec, "usa")
    Rel(main, datacopy, "usa")
    Rel(main, report, "usa")
    Rel(rext, conn, "usa conexão ativa")
    Rel(text, conn, "usa conexão ativa")
    Rel(fkrec, txform, "aplica sobre DDL já transformado")
    Rel(config, output, "usa para exibir valores resolvidos")
    Rel(conn, output, "usa para mensagens")
```

## Componentes de `fix_collation_stamp.py`

Sem overlap de componentes com `migrate_routines.py` (nenhum import cruzado — ver ADR-0005).

```mermaid
C4Component
    title Componentes — fix_collation_stamp.py

    Container_Boundary(script2, "fix_collation_stamp.py") {
        Component(env, "Env Loader", "load_env", "Parser manual de .env — variáveis de ambiente do SO têm prioridade")
        Component(output2, "Output Helpers", "info/ok/warn/error/header/ask/confirm", "Cópia independente dos helpers de migrate_routines.py")
        Component(conn2, "Connection", "connect", "Conexão simples, sem retry de charset/reconexão")
        Component(finder, "Stale Finder", "find_stale_routines, get_current_db_collation", "Identifica rotinas com DATABASE_COLLATION desatualizado + guarda de segurança")
        Component(recreator, "Recreator", "get_ddl, recreate_routine", "DROP+CREATE para forçar re-carimbo do collation")
        Component(log, "Log Writer", "save_log", "Gera log.json/recreated.sql/retry_errors.sql")
        Component(main2, "Main", "main()", "Fluxo: conecta → verifica collation do banco → lista stale → confirma → recria → verifica pós-execução → log")
    }

    Rel(main2, env, "usa")
    Rel(main2, conn2, "usa")
    Rel(main2, finder, "usa")
    Rel(main2, recreator, "usa")
    Rel(main2, log, "usa")
    Rel(recreator, conn2, "usa conexão ativa")
```

## Notas

- O componente mais denso e com mais dependências internas em `migrate_routines.py` é o **FK Recovery Engine** — reflete a complexidade de negócio já identificada em `code-analysis.md`/ADR-0002. 🟢
- Não existem camadas de "service"/"repository"/"controller" no sentido de frameworks web — a organização é puramente funcional, por seção comentada no arquivo (ver estrutura em `CLAUDE.md`). Os "componentes" acima são um agrupamento lógico do Architect para fins de documentação, não uma estrutura de pastas/módulos real no código. 🟡
