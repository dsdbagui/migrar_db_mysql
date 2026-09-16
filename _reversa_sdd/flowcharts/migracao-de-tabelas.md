# Fluxograma — migracao-de-tabelas

> `migrate_routines.py` — extração `:388`, transformações `:575-716`, aplicação/FK/cópia `:747-1076`, orquestração `main() :1686-1995`
> Atualizado em 2026-09-15 pelo Reversa — reflete o commit `971bdf5`: passo de `column_defaults` (DEFAULT real na coluna de destino) inserido antes da cópia de dados.

```mermaid
flowchart TD
    A[main: migrate_tables_flag?] -->|não| Z[pula bloco de tabelas]
    A -->|sim| B[fetch_tables: information_schema.TABLES + SHOW CREATE TABLE]
    B --> C[select_items: cfg ou prompt]
    C --> D[copy_data? schema-only vs schema+dados]
    D --> E[skip_create? tabelas já existem no destino]
    E -->|não| F[force_innodb? pergunta]
    E -->|sim| G[filtros WHERE por tabela, se copy_data]
    F --> G
    G --> G2[column_defaults: cfg tables.column_defaults ou pergunta por coluna, se copy_data]
    G2 --> H[preview de compatibilidade: transform_table_ddl]
    H --> I{aplicar tabelas?}
    I -->|não| Z
    I -->|sim| J[SET FOREIGN_KEY_CHECKS=0]
    J --> K[para cada tabela selecionada]
    K --> L[ensure_connected origem e destino]
    L --> M{skip_create?}
    M -->|sim| N[result.applied = true, sem CREATE]
    M -->|não| O{ddl_original existe?}
    O -->|não| P[result.skipped = true] --> K
    O -->|sim| Q[transform_table_ddl]
    Q --> R{drop_existing_tables?}
    R -->|sim| S[drop_table_if_exists]
    R -->|não| T[apply_table — ver fluxo de recuperação de FK]
    S --> T
    T --> U{erro final?}
    U -->|sim| V[result.apply_error] --> K
    U -->|não| W[result.applied = true; pending_fks += fk_specs se houver]
    N --> WD
    W --> WD{column_defaults para esta tabela?}
    WD -->|sim| WE[ALTER TABLE ... ALTER COLUMN ... SET DEFAULT por coluna — cada uma em try/except isolado]
    WD -->|não| X
    WE --> X{copy_data?}
    X -->|sim| Y[copy_table_data em lotes de 500, WHERE opcional, NULL→default nas colunas configuradas]
    X -->|não| K
    Y --> K
    K -->|todas processadas| AA{pending_fks?}
    AA -->|sim| AB[pergunta: restaurar FKs? → resolve_pending_foreign_keys]
    AA -->|não| AC[SET FOREIGN_KEY_CHECKS=1]
    AB --> AC
    AC --> AD[Resumo + save_report]
```

## `apply_table` — recuperação de FK (dois níveis de fallback)

```mermaid
flowchart TD
    A[CREATE TABLE] --> B{sucesso?}
    B -->|sim| C[retorna ok]
    B -->|não| D{erro é 1215/6125?}
    D -->|não| E[retorna erro — sem recuperação]
    D -->|sim| F{DDL contém FOREIGN KEY própria?}
    F -->|sim| G[strip_foreign_keys: remove FKs do próprio DDL]
    G --> H[tenta CREATE novamente]
    H --> I{sucesso?}
    I -->|sim| J[retorna ok com fk_specs removidas]
    I -->|não| K
    F -->|não| K{extraiu table_name do DDL?}
    K -->|sim| L[find_referencing_fks: FKs de outras tabelas apontando para esta]
    L --> M[drop_referencing_fks: remove FKs órfãs]
    M --> N[tenta CREATE novamente]
    N --> O{sucesso?}
    O -->|sim| P[retorna ok com fk_specs acumuladas]
    O -->|não| Q[retorna último erro]
    K -->|não| Q
```

## `resolve_pending_foreign_keys` — restauração pós-carga

```mermaid
flowchart TD
    A[para cada FK removida] --> B[SELECT colunas ref. GROUP BY ... HAVING COUNT>1]
    B --> C{duplicata encontrada?}
    C -->|sim| D[não restaura — inseguro criar UNIQUE KEY]
    C -->|não| E[ALTER TABLE pai ADD UNIQUE KEY]
    E --> F{sucesso?}
    F -->|não| G[não restaura — falha ao criar UNIQUE KEY]
    F -->|sim| H[ALTER TABLE filha ADD CONSTRAINT ... FOREIGN KEY]
    H --> I{sucesso?}
    I -->|sim| J[FK_RESTORED — info]
    I -->|não| K[FK_NOT_RESTORED — warning, mas UNIQUE KEY permanece criada]
```

Seguro porque `FOREIGN_KEY_CHECKS=0` está ativo durante toda a migração de tabelas — dados órfãos pré-existentes não bloqueiam a criação da constraint neste ponto. 🟢
