# ERD Completo — migra_db_mysql

> Gerado pelo Architect em 2026-09-02 · Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Nota importante

Este projeto **não tem um schema de banco de dados aplicacional próprio** — ele opera *sobre* schemas MySQL arbitrários fornecidos pelo operador em tempo de execução (descobertos via `information_schema`, não modelados estaticamente em código). Não há arquivos DDL, migrations ou ORM no repositório (confirmado em `inventory.md`). A análise detalhada de um schema real fica a cargo do agente independente **Data Master**, que requer acesso a um banco MySQL vivo (não disponível para este agente). 🔴

O ERD abaixo modela, em vez disso, as **estruturas de dados transientes em memória** que o próprio script usa para transportar informação entre suas etapas (extração → transformação → aplicação → relatório) — já documentadas individualmente em `data-dictionary.md`. Não são tabelas persistidas; são dicts/objetos Python que existem apenas durante uma execução.

```mermaid
erDiagram
    ROTINA_EXTRAIDA {
        string name
        string type "PROCEDURE ou FUNCTION"
        string definer
        string charset
        string collation
        string db_collation
        string sql_mode
        string ddl_original
        string extract_error "opcional"
    }

    RESULTADO_ROTINA {
        string name
        string type
        string definer
        bool applied
        bool skipped
        string ddl_original
        string ddl_fixed
        string apply_error "opcional"
    }

    TABELA_EXTRAIDA {
        string name
        string engine
        int approx_rows
        string collation
        string ddl_original
        string extract_error "opcional"
    }

    RESULTADO_TABELA {
        string name
        string engine
        int approx_rows
        string mode "schema ou full"
        bool applied
        bool skipped
        string ddl_original
        string ddl_fixed
        string apply_error "opcional"
        int rows_copied
        string copy_error "opcional"
    }

    ISSUE {
        string code
        string severity "error, warning ou info"
        string description
        string original
        string fixed
    }

    FK_SPEC {
        string fk_name
        string child_table
        string ref_table
        string extra "ON DELETE/UPDATE"
    }

    CONFIG {
        dict source
        dict destination
        bool migrate_routines
        bool migrate_tables
        string new_definer "opcional"
        dict routines
        dict tables
    }

    REPORT_DATA {
        string timestamp
        string source_db
        string destination_db
        dict routines
        dict tables
    }

    ROTINA_EXTRAIDA ||--|| RESULTADO_ROTINA : "transformada em (transform_routine)"
    RESULTADO_ROTINA ||--o{ ISSUE : "acumula 0..N"
    TABELA_EXTRAIDA ||--|| RESULTADO_TABELA : "transformada em (transform_table_ddl)"
    RESULTADO_TABELA ||--o{ ISSUE : "acumula 0..N"
    RESULTADO_TABELA ||--o{ FK_SPEC : "gera 0..N ao remover FK (apply_table)"
    FK_SPEC }o--|| RESULTADO_TABELA : "referencia ref_table (outra tabela do lote)"
    CONFIG ||--o{ RESULTADO_ROTINA : "orienta seleção/aplicação via routines.*"
    CONFIG ||--o{ RESULTADO_TABELA : "orienta seleção/aplicação via tables.*"
    REPORT_DATA ||--o{ RESULTADO_ROTINA : "serializa (sem original/fixed do Issue)"
    REPORT_DATA ||--o{ RESULTADO_TABELA : "serializa (sem original/fixed do Issue)"
```

## Cardinalidades e relações — leitura

| Relação | Cardinalidade | Observação |
|---|---|---|
| Rotina extraída → Resultado de rotina | 1:1 | Uma rotina extraída gera exatamente um resultado por execução |
| Resultado de rotina → Issue | 1:N (0 ou mais) | Cada transformação aplicada pode ou não gerar uma Issue |
| Tabela extraída → Resultado de tabela | 1:1 | Idem rotinas |
| Resultado de tabela → Issue | 1:N (0 ou mais) | Inclui issues de transformação **e** de recuperação de FK |
| Resultado de tabela → FK Spec | 1:N (0 ou mais) | Só existe se `apply_table` precisou remover FK(s) |
| FK Spec → Resultado de tabela (ref_table) | N:1 | A FK removida referencia outra tabela do mesmo lote de migração — 🟡 relação lógica, não uma FK real de banco nestas estruturas em memória |
| Config → Resultado de rotina/tabela | 1:N | Uma única config orienta todas as seleções/decisões da execução |
| Report Data → Resultado de rotina/tabela | 1:N | O relatório final agrega todos os resultados da execução |

## Lacunas 🔴

- Schema real do(s) banco(s) MySQL migrados: não documentável sem acesso a uma instância viva — delegado ao agente Data Master.
- Não há uma "entidade Migração" formal que amarre uma execução completa (com id, data, usuário) além do `timestamp` usado no nome do diretório de relatório.
