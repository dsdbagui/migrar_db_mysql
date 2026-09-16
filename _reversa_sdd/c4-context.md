# C4 — Nível 1: Contexto

> Gerado pelo Architect em 2026-09-02 · Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA
> Atualizado em 2026-09-15 pelo Reversa — porta padrão do destino mudou para 3306 no commit `971bdf5` (ambas as portas são apenas defaults de prompt, configuráveis).

```mermaid
C4Context
    title Contexto do Sistema — migra_db_mysql

    Person(operador, "Operador / DBA", "Executa os scripts CLI interativamente, responde perguntas de migração, revisa relatórios")

    System(migra_tool, "migra_db_mysql", "Par de scripts Python CLI: migração MySQL 5→8 (rotinas + tabelas) e correção de collation de rotinas")

    SystemDb_Ext(mysql_origem, "MySQL 5.x — Origem", "Banco de dados legado, fonte de leitura (rotinas, tabelas, dados)")
    SystemDb_Ext(mysql_destino, "MySQL 8.x — Destino", "Banco de dados alvo, recebe DDL corrigido e dados copiados")
    System_Ext(filesystem, "Sistema de arquivos local", "Arquivo .env / --config JSON de entrada; migration_report_*/ e fix_collation_*/ de saída")

    Rel(operador, migra_tool, "Executa via linha de comando, responde prompts interativos")
    Rel(migra_tool, mysql_origem, "Lê metadados e dados", "mysql-connector-python / TCP 3306")
    Rel(migra_tool, mysql_destino, "Escreve DDL corrigido e dados; pode criar o banco se ausente (erro 1049)", "mysql-connector-python / TCP 3306 (default configurável)")
    Rel(migra_tool, filesystem, "Lê config/.env, escreve relatórios e logs", "I/O local")
    Rel(operador, filesystem, "Abre report.html no navegador, edita migration_config.json/.env", "file://")
```

## Notas

- Não há sistema de autenticação próprio, API externa consumida, fila de mensagens ou serviço de terceiros — a única "integração externa" real são os dois servidores MySQL (origem e destino), acessados via protocolo MySQL padrão. 🟢
- `mysql_origem` e `mysql_destino` podem ser (e frequentemente são, no fluxo de `fix_collation_stamp.py`) o **mesmo servidor físico**, em momentos diferentes do ciclo de migração — o diagrama os separa porque são conceitualmente papéis distintos (fonte vs. alvo) em `migrate_routines.py`, não necessariamente hosts distintos. 🟡
- Não há ambiente de produção/homologação formalmente modelado no código — o README recomenda "sempre teste em homologação antes de aplicar em produção", mas isso é responsabilidade do operador, não do script (não há flag `--env` ou similar). 🟢
