# migrar_db_mysql

Ferramentas de linha de comando para migrar bancos MySQL 5.x → 8.x: procedures, functions e tabelas (esquema e/ou dados), com correção automática de incompatibilidades comuns entre as duas versões.

## `migrate_routines.py`

Ferramenta interativa principal. Migra:

- **Procedures e functions** — remove/substitui `DEFINER`, corrige sintaxe incompatível com o MySQL 8 (`SET OPTION`, `OLD_PASSWORD()`, `sql_mode` legado, `SQL SECURITY DEFINER`, charset inline, etc.)
- **Tabelas** — esquema (`CREATE TABLE`) e/ou dados, com:
  - conversão `MyISAM` → `InnoDB` (opcional)
  - `utf8` → `utf8mb4`, remoção de opções exclusivas do MyISAM, `ZEROFILL`, display width de inteiros deprecado
  - recuperação automática de erros de `FOREIGN KEY` (MySQL 8 exige unique key na tabela referenciada) — remove a FK problemática, migra os dados, e tenta restaurá-la depois de identificar/criar a unique key que faltava
  - filtro `WHERE` por tabela na cópia de dados
  - opção de só inserir dados em tabelas já existentes no destino (sem recriar o esquema)

Gera relatório completo em `migration_report_<timestamp>/`: `report.html` (leitura no navegador), `report.json`, `migration.sql` e SQL de retry para o que falhar.

### Instalação

```bash
pip install mysql-connector-python rich
```

### Uso interativo

```bash
python migrate_routines.py
```

O script pergunta interativamente os dados de conexão de origem/destino e todas as decisões da migração.

### Uso com arquivo de respostas

Para pular as perguntas em execuções repetidas:

```bash
python migrate_routines.py --init-config migration_config.json   # gera o modelo
python migrate_routines.py --config migration_config.json        # usa o modelo preenchido
```

Qualquer campo deixado de fora do arquivo continua sendo perguntado normalmente — não precisa preencher tudo de uma vez. **Não commite esse arquivo se ele tiver senha em texto puro** (já está no `.gitignore` por padrão).

## `fix_collation_stamp.py`

Script auxiliar para recriar procedures/functions cujo `DATABASE_COLLATION` ainda está carimbado com um collation antigo (ex: `utf8mb4_unicode_ci`), depois que o banco já foi convertido para o collation atual (ex: `utf8mb4_0900_ai_ci`). A recriação faz o MySQL carimbar automaticamente o collation corrente.

```bash
python fix_collation_stamp.py
```

Lê credenciais de um `.env` na mesma pasta (veja `.env.example`) ou pergunta interativamente se ele não existir.

## Avisos

- Nenhum dos scripts commita `.env`, arquivos de config com senha, ou os diretórios `migration_report_*/` — todos ficam de fora via `.gitignore`.
- Sempre teste em um ambiente de homologação antes de aplicar em produção.
