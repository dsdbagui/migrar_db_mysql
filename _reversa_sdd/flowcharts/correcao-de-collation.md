# Fluxograma — correcao-de-collation

> `fix_collation_stamp.py` (script independente, inteiro)

```mermaid
flowchart TD
    A[python fix_collation_stamp.py] --> B[load_env .env]
    B --> C{.env tem DB_HOST/USER/PASSWORD?}
    C -->|sim| D[usa valores do .env, sem perguntar]
    C -->|não| E[pergunta host/port/user/senha/database interativamente]
    D --> F[connect]
    E --> F
    F --> G{conectou?}
    G -->|não| Z1[sys.exit 1]
    G -->|sim| H[get_current_db_collation]
    H --> I{collation atual == OLD_COLLATION 'utf8mb4_unicode_ci'?}
    I -->|sim| J[warn: converta o banco primeiro; sys.exit 1]
    I -->|não| K[find_stale_routines: rotinas com DATABASE_COLLATION antigo]
    K --> L{rotinas encontradas?}
    L -->|não| Z2[ok: nada a fazer; sys.exit 0]
    L -->|sim| M[lista rotinas na tela]
    M --> N{confirma recriar?}
    N -->|não| Z3[warn: cancelado; sys.exit 0]
    N -->|sim| O[para cada rotina: recreate_routine]
    O --> P[get_ddl: SHOW CREATE, remove DEFINER]
    P --> Q[DROP rtype IF EXISTS]
    Q --> R[CREATE ddl — MySQL carimba DATABASE_COLLATION atual automaticamente]
    R --> S{sucesso?}
    S -->|sim| T[results += success=true]
    S -->|não| U[results += success=false, error]
    T --> O
    U --> O
    O -->|todas processadas| V[resumo: total/ok/erro]
    V --> W[find_stale_routines de novo — verificação pós-execução]
    W --> X{ainda há rotina desatualizada?}
    X -->|sim| Y[warn: lista as que ainda estão com collation antigo]
    X -->|não| AA[ok: nenhuma restante]
    Y --> AB
    AA --> AB{salvar log?}
    AB -->|sim| AC[save_log: log.json + recreated.sql + retry_errors.sql se houver falha]
    AB -->|não| AD[fim]
    AC --> AD
```

Nenhuma das transformações de `migrate_routines.py` (`TRANSFORMATIONS`) é aplicada aqui — o único DDL alterado é a remoção do `DEFINER`; o re-carimbo do collation é efeito colateral do `DROP`+`CREATE` no MySQL, não de uma instrução SQL direta. 🟢
