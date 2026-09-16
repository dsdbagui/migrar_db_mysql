# Fluxograma — arquivo-de-configuracao

> `migrate_routines.py:55-247`
> Atualizado em 2026-09-15 pelo Reversa — reflete o commit `971bdf5`: fluxo em si inalterado; o template gerado por `--init-config` ganhou as chaves `destination.create_database_if_missing` e `tables.column_defaults` (ver `data-dictionary.md`).

```mermaid
flowchart TD
    A[python migrate_routines.py --config arquivo.json] --> B[load_config: lê e faz parse do JSON]
    B --> C{JSON válido e arquivo existe?}
    C -->|não| D[error + sys.exit 1]
    C -->|sim| E[CONFIG = dict carregado]
    E --> F[main executa]
    F --> G[cfg_ask / cfg_confirm / select_items chamados nos pontos de decisão]

    G --> H{cfg key existe em CONFIG?}
    H -->|sim| I[usa valor do config; informa no console; NÃO pergunta]
    H -->|não| J[delega para ask/confirm interativo original]
```

## `cfg(key, default)` — resolução de caminho com pontos

```mermaid
flowchart LR
    A["cfg('tables.force_innodb')"] --> B[node = CONFIG]
    B --> C[para cada parte do path: 'tables', 'force_innodb']
    C --> D{node é dict e parte está em node?}
    D -->|não| E[retorna default]
    D -->|sim| F[node = node parte]
    F --> C
    C -->|todas as partes percorridas| G[retorna node, ou default se node for None]
```

## `select_items` — seleção de rotinas/tabelas

```mermaid
flowchart TD
    A[select_items items, cfg_key, label] --> B{cfg cfg_key existe?}
    B -->|sim, 'all'| C[retorna todos os índices]
    B -->|sim, lista de nomes| D[filtra items cujo nome está na lista]
    D --> E[nomes não encontrados → warn, mas não aborta]
    B -->|não| F[confirm: migrar TODAS?]
    F -->|sim| G[retorna todos os índices]
    F -->|não| H[pede números separados por vírgula]
    H --> I[parse: apenas dígitos válidos e dentro do range viram índices]
```

## `--init-config` (`write_config_template`)

```mermaid
flowchart LR
    A[python migrate_routines.py --init-config arquivo.json] --> B[monta dict template fixo com todas as chaves + _comment_*]
    B --> C[escreve JSON indentado em arquivo.json]
    C --> D[sys.exit 0 — não executa main]
```
