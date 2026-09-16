# Permissões e Papéis — migra_db_mysql

> Gerado pelo Detective em 2026-09-02
> Atualizado em 2026-09-15 pelo Reversa — reflete o commit `971bdf5`: dois novos privilégios inferidos (criação de banco no destino, `ALTER` de `DEFAULT` de coluna).
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Contexto

Este projeto **não é uma aplicação multiusuário** com RBAC/ACL de aplicação — é uma ferramenta CLI operada interativamente por um único operador (tipicamente um DBA) por execução. Não há login, sessão, papéis de usuário nem controle de acesso a funcionalidades dentro do próprio script: quem roda `python migrate_routines.py` tem acesso a todas as opções. 🟢

O conceito de "permissão" relevante neste domínio é de dois tipos, ambos no nível do **MySQL**, não da aplicação:

1. Os privilégios do usuário MySQL usado para conectar (origem e destino são conexões independentes, com credenciais possivelmente diferentes)
2. O contexto de segurança `DEFINER`/`INVOKER` das rotinas armazenadas migradas

## 1. Papel "Operador" (único papel de aplicação)

| Aspecto | Descrição |
|---|---|
| Quem | Quem executa o script na linha de comando |
| Acesso | Total a todas as funcionalidades — sem distinção de papéis dentro da ferramenta |
| Autenticação | Nenhuma própria; a "autenticação" é indiretamente feita pelo MySQL ao aceitar as credenciais informadas para origem/destino |
| Autorização | Nenhuma própria; qualquer erro de privilégio insuficiente aparece como `MySQLError` capturado e reportado como `apply_error`/`extract_error`, não como uma checagem prévia do script |

🟢 Confirmado: não há nenhum mecanismo de login, arquivo de usuários ou verificação de papel em nenhum dos dois scripts.

## 2. Privilégios MySQL necessários (inferidos das operações executadas)

### Conexão de origem (leitura)

| Operação no código | Privilégio MySQL necessário (inferido) |
|---|---|
| `SELECT ... FROM information_schema.ROUTINES/TABLES` | `SELECT` em `information_schema` (geralmente liberado por padrão) |
| `SHOW CREATE PROCEDURE/FUNCTION/TABLE` | Requer ser o `DEFINER` da rotina, **ou** ter o privilégio `SHOW CREATE ROUTINE`/`SELECT` na tabela correspondente — 🟡 se o usuário de conexão não for o definer original nem tiver privilégio administrativo, `ddl_original` fica `None` e o item é marcado `skipped`/`extract_error` silenciosamente, sem uma mensagem específica de "privilégio insuficiente" no fluxo |
| `SELECT * FROM tabela` (cópia de dados) | `SELECT` na tabela de origem |

### Conexão de destino (escrita)

| Operação no código | Privilégio MySQL necessário (inferido) |
|---|---|
| `DROP PROCEDURE/FUNCTION/TABLE IF EXISTS` | `DROP` |
| `CREATE PROCEDURE/FUNCTION` | `CREATE ROUTINE` (e `ALTER ROUTINE`/`EXECUTE` dependendo da versão/config do MySQL) |
| `CREATE TABLE` | `CREATE` |
| `ALTER TABLE ... ADD UNIQUE KEY / ADD CONSTRAINT ... FOREIGN KEY / DROP FOREIGN KEY` | `ALTER`, `REFERENCES` |
| `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` (novo em `971bdf5`, `tables.column_defaults`) | `ALTER` |
| `INSERT INTO ...` (cópia de dados) | `INSERT` |
| `SELECT ... information_schema.KEY_COLUMN_USAGE/REFERENTIAL_CONSTRAINTS` (busca de FKs órfãs) | `SELECT` em `information_schema` |
| `SET FOREIGN_KEY_CHECKS=0/1` | Nenhum privilégio especial — variável de sessão |
| `CREATE DATABASE IF NOT EXISTS ...` (novo em `971bdf5`, erro 1049 + `create_database_if_missing`) | `CREATE` **a nível de servidor** (não apenas no banco alvo — que ainda não existe no momento da criação); privilégio mais amplo que os demais desta tabela, verificado apenas na conexão administrativa separada usada para esse `CREATE DATABASE` |

🟢 Confirmado por leitura direta do código: nenhum desses privilégios é verificado previamente, nem documentado no README/CLAUDE.md — esta tabela é inferência a partir das instruções SQL executadas, não uma lista oficial. Não há um passo de "pré-voo" que valide privilégios antes de iniciar a migração; falhas de privilégio só aparecem durante a execução, misturadas com outros tipos de erro. (A ausência de uma verificação é, em si, um fato observável no código — não uma lacuna de conhecimento.)

## 3. `DEFINER` / `SQL SECURITY` — o "controle de acesso" das rotinas migradas

Diferente de RBAC de aplicação, este é o mecanismo de segurança real que a ferramenta manipula ativamente:

| Conceito MySQL | Como a ferramenta trata |
|---|---|
| `DEFINER=\`user\`@\`host\`` | Removido por padrão (`remove_definer`), ou substituído por um `new_definer` único fornecido pelo operador — nunca mapeado individualmente por rotina |
| `SQL SECURITY DEFINER` (rotina executa com os privilégios do definer) | Apenas **avisado** (`fix_sql_security`, severidade `warning`) — sugestão de trocar para `INVOKER`, sem alteração automática |
| `SQL SECURITY INVOKER` (rotina executa com os privilégios de quem chama) | Não gerado automaticamente; a sugestão do aviso acima é a única menção |

🟡 Implicação de negócio: ao remover o DEFINER sem especificar um novo, o MySQL usa o usuário que está executando o `CREATE` (a conexão de destino) como definer implícito — ou seja, **o operador que roda a migração se torna o definer de todas as rotinas migradas**, a menos que `new_definer` seja explicitamente configurado. Isso é uma decisão de segurança silenciosa que pode não ser óbvia para quem só olha os avisos do script.

## Lacunas 🔴

Nenhuma pendente — as duas lacunas originais desta seção foram resolvidas em revisão (2026-09-15):

- 🟢 Confirmado pelo operador (`questions.md#pergunta-1`): erros de privilégio insuficiente já foram observados em uso real caindo corretamente no tratamento genérico de `MySQLError` → `extract_error`/`apply_error`, sem exceção não tratada.
- 🟢 Confirmado pelo operador (`questions.md#pergunta-9`): ausência de registro de "quem rodou a migração" em `report.json` não é relevante para o caso de uso — não vira requisito na reimplementação.
