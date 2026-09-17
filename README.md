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

## Versão web (Node.js/TypeScript)

Sucessora dos dois scripts acima, com backend Fastify (`src/`) + frontend wizard (`web/`). Roteiro completo de teste manual em `_reversa_forward/001-frontend-wizard-migracao-web/onboarding.md`.

### Pré-requisitos

- Node.js ≥ 20.
- Um MySQL 8.x **só para o App DB** — armazena perfis de conexão e histórico de jobs da própria aplicação web. Não confundir com os MySQL de origem/destino que você vai migrar: esses são digitados na tela de perfis de conexão do wizard, em tempo de execução. Se não tiver um MySQL disponível para isso, um container descartável resolve:
  ```bash
  docker run -d --name migra-web-appdb \
    -e MYSQL_ROOT_PASSWORD=<senha> -e MYSQL_DATABASE=app_migracao \
    -p 3307:3306 mysql:8
  ```

### Setup

```bash
# backend (raiz)
npm install
cp .env.example .env   # preencha APP_DB_* com o MySQL do passo anterior
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # gera CREDENTIAL_VAULT_KEY, cole no .env
npm run migrate         # aplica src/core/db/migrations/001_init.sql no App DB
npm run dev              # backend Fastify em http://localhost:3000

# frontend (outro terminal)
cd web
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:3000 (ajuste se o backend estiver noutra porta/host)
npm run dev              # Vite em http://localhost:5173
```

Abra `http://localhost:5173` no navegador. Os `.env` de cada lado nunca são commitados (`.gitignore`) — cada ambiente (cada máquina, cada clone) precisa gerar os seus próprios, inclusive uma `CREDENTIAL_VAULT_KEY` nova.

## Avisos

- Nenhum dos scripts commita `.env`, arquivos de config com senha, ou os diretórios `migration_report_*/` — todos ficam de fora via `.gitignore`.
- Sempre teste em um ambiente de homologação antes de aplicar em produção.
