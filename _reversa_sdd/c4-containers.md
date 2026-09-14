# C4 — Nível 2: Containers

> Gerado pelo Architect em 2026-09-02 · Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

"Container" aqui no sentido C4 (unidade de deploy/execução), não Docker — este projeto não usa containers Docker. 🟢

```mermaid
C4Container
    title Containers — migra_db_mysql

    Person(operador, "Operador / DBA")

    System_Boundary(tool, "migra_db_mysql") {
        Container(migrate_script, "migrate_routines.py", "Script Python CLI (interativo)", "Migração completa: rotinas + tabelas MySQL 5→8, com relatório")
        Container(collation_script, "fix_collation_stamp.py", "Script Python CLI (interativo)", "Correção pontual de DATABASE_COLLATION em rotinas — independente, sem import cruzado com migrate_script")
        ContainerDb(local_fs, "Arquivos locais", "Filesystem", "migration_config*.json / .env (entrada); migration_report_<ts>/ e fix_collation_<db>_<ts>/ (saída)")
    }

    SystemDb_Ext(mysql_origem, "MySQL 5.x — Origem")
    SystemDb_Ext(mysql_destino, "MySQL 8.x — Destino")

    Rel(operador, migrate_script, "python migrate_routines.py [--config|--init-config]")
    Rel(operador, collation_script, "python fix_collation_stamp.py")

    Rel(migrate_script, mysql_origem, "SELECT information_schema, SHOW CREATE ...", "mysql-connector-python")
    Rel(migrate_script, mysql_destino, "DROP/CREATE/ALTER/INSERT, SET FOREIGN_KEY_CHECKS", "mysql-connector-python")
    Rel(migrate_script, local_fs, "Lê --config JSON; escreve report.json/html/sql")

    Rel(collation_script, mysql_origem, "Mesmo banco atua como origem e destino (DROP+CREATE local)", "mysql-connector-python")
    Rel(collation_script, local_fs, "Lê .env; escreve log.json/recreated.sql")
```

## Detalhamento dos containers

| Container | Tecnologia | Responsabilidade | Estado/persistência |
|---|---|---|---|
| `migrate_routines.py` | Python 3.9+, `mysql-connector-python`, `rich` (opcional) | Orquestra extração → transformação → aplicação → relatório para rotinas e tabelas | Sem estado entre execuções — cada rodada é independente; o único "estado" persistido é o relatório gerado em disco |
| `fix_collation_stamp.py` | Python 3.9+, `mysql-connector-python`, `rich` (opcional) | Recria rotinas com collation desatualizado no mesmo banco | Idem — sem estado entre execuções |
| Arquivos locais | JSON / `.env` / SQL / HTML | Entrada de configuração e saída de relatórios/logs | Cada execução gera um diretório timestampado novo — não há limpeza automática (`.gitignore` os exclui do versionamento, mas ficam acumulando no disco) 🟡 |

## Dívidas técnicas observadas neste nível

- **Duplicação entre containers:** `fix_collation_stamp.py` reimplementa `info/ok/warn/error/header/ask/confirm`, `connect()` e a regex de remoção de `DEFINER` já existentes em `migrate_routines.py` — nenhum módulo compartilhado foi extraído (ver ADR-0005). 🟢
- **Sem gerenciador de dependências formal:** nenhum `requirements.txt`/`pyproject.toml` — versões de `mysql-connector-python`/`rich` não são fixadas, risco de quebra por atualização de dependência não testada. 🟢
- **Sem testes automatizados:** 0% de cobertura (confirmado por `inventory.md`) — toda a lógica de transformação regex e recuperação de FK depende de revisão manual/execução real para validação. 🟢
- **Acúmulo de diretórios de saída:** `migration_report_<ts>/` e `fix_collation_<db>_<ts>/` não são limpos automaticamente — o `inventory.md` já lista 5 diretórios de relatório acumulados no repositório local (fora do controle de versão). 🟡
