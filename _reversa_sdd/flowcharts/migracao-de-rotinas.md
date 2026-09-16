# Fluxograma — migracao-de-rotinas

> `migrate_routines.py` — extração `:345`, transformações `:434-574`, aplicação `:717-746`, orquestração `main() :1544-1685`
> Atualizado em 2026-09-15 pelo Reversa — apenas números de linha revalidados contra o commit `971bdf5` (fluxo de rotinas em si não foi alterado por esse commit).

```mermaid
flowchart TD
    A[main: migrate_routines_flag?] -->|não| Z[pula bloco de rotinas]
    A -->|sim| B[ensure_connected origem]
    B --> C[fetch_routines: information_schema.ROUTINES + SHOW CREATE]
    C --> D{rotinas encontradas?}
    D -->|não| Z
    D -->|sim| E[exibe tabela #, tipo, nome, definer]
    E --> F[select_items: cfg ou prompt manual]
    F --> G[preview: transform_routine em cada selecionada, sem aplicar]
    G --> H{issues encontradas?}
    H -->|sim| I[mostra contagem erros/avisos + detalhes opcionais]
    H -->|não| J[ok: nenhum problema]
    I --> K{aplicar rotinas?}
    J --> K
    K -->|não| Z
    K -->|sim| L[drop_existing? pergunta]
    L --> M[ensure_connected destino]
    M --> N[para cada rotina selecionada]
    N --> O{ddl_original existe?}
    O -->|não| P[result.skipped = true]
    P --> N
    O -->|sim| Q[transform_routine: remove_definer + TRANSFORMATIONS]
    Q --> R[normalize_delimiter]
    R --> S{drop_existing?}
    S -->|sim| T[drop_if_exists]
    S -->|não| U[apply_routine: USE db; DDL]
    T --> U
    U --> V{erro MySQL?}
    V -->|sim| W[result.apply_error = erro; rollback]
    V -->|não| X[result.applied = true; commit]
    W --> N
    X --> N
    N -->|todas processadas| Y[routine_results completo]
    Y --> AA[Resumo + save_report]
```

## Transformações aplicadas em sequência (`transform_routine`)

```mermaid
flowchart LR
    DDL[DDL original] --> T0[remove_definer]
    T0 --> T1[fix_set_option — error]
    T1 --> T2[fix_old_password_hash — error]
    T2 --> T3[clean_sql_mode — error]
    T3 --> T4[fix_no_zero_date — warning]
    T4 --> T5[fix_group_concat_maxlen — warning]
    T5 --> T6[fix_sql_security — warning]
    T6 --> T7[fix_no_default_charset — warning]
    T7 --> T8[fix_only_full_group_by — warning]
    T8 --> OUT[DDL corrigido + lista de Issues]
```

Cada etapa é independente (regex pura) — nenhuma depende do resultado da anterior além de operar sobre o DDL já modificado até ali. 🟢
