# User Story — Migrar schema e dados de um MySQL 5.x para MySQL 8.x

> Fonte: `migracao-de-rotinas/requirements.md`, `migracao-de-tabelas/requirements.md`, `arquivo-de-configuracao/requirements.md`, `code-analysis.md`, `domain.md`.
> Unit(s) relacionada(s): `migracao-de-rotinas/`, `migracao-de-tabelas/`, `arquivo-de-configuracao/` (infraestrutura de suporte).
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## História

**Como** um DBA/operador responsável por atualizar um banco de produção de MySQL 5.x para MySQL 8.x,
**Eu quero** migrar procedures, functions e tabelas (com ou sem os dados) do banco de origem para um banco de destino, com as incompatibilidades sintáticas conhecidas já corrigidas automaticamente,
**Para que** eu não precise reescrever manualmente cada rotina/tabela nem descobrir na marra, uma por uma em produção, quais objetos quebram no MySQL 8. 🟢

## Contexto de negócio

O projeto existe porque migrações MySQL 5→8 quebram silenciosamente em padrões específicos (`DEFINER` de usuário inexistente no destino, `SET OPTION` removido, engines MyISAM legadas, foreign keys sem `UNIQUE KEY` na coluna referenciada, etc.). A ferramenta prioriza **completar a migração de estrutura e dados primeiro**, tratando integridade referencial estrita e correções semanticamente ambíguas como *best-effort* revisável depois (ver `domain.md`, "Sobre a estratégia de recuperação de FK"). 🟡

## Personas

| Persona | Papel | Motivação |
|---|---|---|
| DBA/Operador | Executa o script interativamente ou via `--config`, decide connections, seleção de itens e opções (`force_innodb`, `skip_create`, `column_defaults`) | Migrar o banco com o mínimo de retrabalho manual e o máximo de rastreabilidade do que foi alterado 🟢 |

Não há outras personas — é uma ferramenta CLI de uso individual, sem RBAC de aplicação (ver `permissions.md`). 🟢

## Cenários

```gherkin
Cenário: Migrar rotinas removendo DEFINER e corrigindo sintaxe incompatível
  Dado um banco de origem com a procedure "sp_exemplo" contendo DEFINER e SET OPTION
  Quando o operador seleciona "sp_exemplo" para migração e confirma a aplicação
  Então a procedure é criada no destino sem o DEFINER original (ou com new_definer, se configurado)
    E sem a cláusula SET OPTION (substituída por SET)
    E o resultado é registrado com applied=true

Cenário: Migrar tabelas com schema + dados, incluindo foreign key problemática
  Dado uma tabela de origem "pedidos" com FK para "clientes" cuja coluna referenciada não tem UNIQUE KEY no destino
  Quando o operador seleciona "pedidos" para migração com cópia de dados e confirma a aplicação
  Então o CREATE TABLE inicial falha com erro 1215/6125
    E o script remove a FK problemática automaticamente e recria a tabela com sucesso
    E os dados são copiados em lotes de 500 linhas
    E a FK removida fica registrada, pendente de restauração ao final

Cenário: Substituir NULL por um valor padrão ao copiar dados sujos
  Dado uma tabela de origem com uma linha contendo NULL numa coluna NOT NULL do destino
    E o operador configurou um valor padrão para essa tabela/coluna (literal, ou "hoje" para a data corrente)
  Quando os dados são copiados
  Então a linha é inserida com o valor configurado no lugar do NULL, sem erro de sql_mode estrito
    E a coluna do destino fica com esse valor como DEFAULT real do schema

Cenário: Rodar a migração inteira sem interação, via arquivo de config
  Dado um arquivo JSON com "routines.select": "all", "tables.select": ["pedidos", "clientes"] e "tables.force_innodb": true
  Quando o operador roda o script com --config apontando para esse arquivo
  Então nenhuma das perguntas cobertas pelo config é feita interativamente
    E as rotinas e tabelas são migradas conforme as respostas pré-definidas

Cenário: Banco de destino ainda não existe
  Dado que o banco informado na conexão de destino não existe no servidor
  Quando o operador confirma a criação automática (interativa ou via destination.create_database_if_missing)
  Então o banco é criado com CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
    E a conexão é refeita automaticamente, prosseguindo a migração

Cenário: Pular criação de schema quando as tabelas já existem no destino
  Dado que as tabelas de destino já foram criadas previamente (ex: manualmente, como InnoDB)
  Quando o operador ativa skip_create para a migração de tabelas
  Então nenhum DROP/CREATE TABLE é emitido
    E apenas a cópia de dados é executada sobre as tabelas já existentes
```

## Fluxo alternativo — restauração de foreign keys

```gherkin
Cenário: Restaurar FK removida após todos os dados serem carregados
  Dado que todas as tabelas e dados já foram migrados, incluindo uma FK pendente de restauração
  Quando o operador confirma "restaurar foreign keys removidas"
    E a coluna referenciada não tem valores duplicados
  Então uma UNIQUE KEY é criada na tabela pai e a FOREIGN KEY original é recriada na tabela filha
    E o resultado da tabela recebe a issue FK_RESTORED (info)

Cenário: FK não pode ser restaurada com segurança
  Dado a mesma situação acima, mas a coluna referenciada tem valores duplicados
  Quando a restauração é tentada
  Então a FK não é recriada
    E o resultado da tabela recebe a issue FK_NOT_RESTORED (warning), sem abortar a migração
```

## Critérios de aceite (resumo)

- Toda rotina/tabela selecionada aparece no resultado final com um status coerente (`applied`/`skipped`/erro). 🟢
- Nenhuma rotina aplicada no destino mantém o `DEFINER` original. 🟢
- Nenhuma tabela aplicada mantém sintaxe MySQL 4.x (`TYPE=`) ou engine não-InnoDB quando `force_innodb=true`. 🟢
- Falha isolada numa rotina/tabela não aborta o restante do lote. 🟢
- Todo ponto de decisão interativo tem uma chave `--config` equivalente, permitindo execução não interativa completa. 🟢

## Fora de escopo desta história

- Geração do relatório final — ver [Revisar e reprocessar o relatório de migração](revisar-e-reprocessar-relatorio.md).
- Correção do carimbo de collation pós-migração — fluxo separado, ver [Corrigir collation pós-migração](corrigir-collation-pos-migracao.md).

## Rastreabilidade

| Unit | Requisitos cobertos |
|---|---|
| `migracao-de-rotinas/` | RF-01 a RF-07 (`requirements.md`) |
| `migracao-de-tabelas/` | RF-01 a RF-09 (`requirements.md`) |
| `arquivo-de-configuracao/` | RF-01 a RF-06 (`requirements.md`) — habilita os cenários "via config" e "banco de destino ainda não existe" acima |
