# migracao-de-tabelas

> Fonte: `code-analysis.md` (Feature: migracao-de-tabelas), `domain.md`, `state-machines.md`, `data-dictionary.md`, `flowcharts/migracao-de-tabelas.md`, ADR-0001, ADR-0002, ADR-0006.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão Geral

Extrai tabelas de um MySQL 5.x de origem, corrige incompatibilidades de DDL conhecidas com MySQL 8.x, cria o esquema no destino recuperando-se automaticamente de erros de foreign key (removendo e, depois de todos os dados carregados, tentando restaurar), e opcionalmente copia os dados linha a linha em lotes — com filtro `WHERE` e substituição de `NULL` por um valor padrão, ambos configuráveis por tabela/coluna. 🟢

## Responsabilidades

- Extrair metadados e DDL completo de cada tabela do banco de origem (`fetch_tables`). 🟢
- Detectar e corrigir automaticamente padrões de DDL de tabela incompatíveis com MySQL 8 (`transform_table_ddl` + lista `TABLE_TRANSFORMATIONS`), com conversão de engine para InnoDB como opção explícita do operador (`force_innodb`). 🟢
- Criar o esquema no destino, recuperando-se automaticamente de erros de foreign key (1215/6125) via duas estratégias em ordem: remover FK da própria tabela, depois remover FKs órfãs de outras tabelas que apontam para esta (`apply_table`). 🟢
- Permitir pular a criação de esquema quando as tabelas de destino já existem (`skip_create`), executando só a cópia de dados. 🟢
- Copiar dados em lotes de 500 linhas quando solicitado, com filtro `WHERE` opcional por tabela e substituição de `NULL` por um valor padrão configurado por coluna, aplicado tanto como `DEFAULT` real do schema quanto em memória antes do `INSERT` (`copy_table_data`, `column_defaults`). 🟢
- Tentar restaurar, após todas as tabelas e dados migrados, as foreign keys removidas durante a recuperação — apenas quando a coluna referenciada estiver livre de duplicatas (`resolve_pending_foreign_keys`). 🟢
- Registrar, por tabela, o resultado da operação (`applied`/`skipped`/erro, linhas copiadas, FKs pendentes/restauradas) para consumo pelo Report Generator. 🟢

## Regras de Negócio

- Prioridade implícita de negócio: **dados e estrutura primeiro, integridade referencial estrita depois, best-effort** — uma migração pode terminar `applied=True` numa tabela sem que todas as FKs originais tenham sido restauradas (`FK_NOT_RESTORED`, warning, não erro fatal). 🟡 (ver `domain.md`, "Sobre a estratégia de recuperação de FK")
- `TINYINT(1)` é deliberadamente preservado ao remover display width de outros inteiros — convenção de boolean em ORMs, não é tratado como caso cosmético igual aos demais. 🟢
- Um `DEFAULT` de coluna sozinho não evita erro de `NOT NULL` quando o `INSERT` envia `NULL` explícito (sempre o caso em `copy_table_data`) — por isso `column_defaults` aplica o valor em dois lugares simultâneos: `ALTER TABLE ... SET DEFAULT` no schema (efeito permanente) e substituição em memória por linha (efeito nesta cópia). 🟡 Ver ADR-0006.
- `skip_create=true` pula inteiramente `DROP`/`CREATE`, mas o `ALTER TABLE ... SET DEFAULT` por coluna configurada ainda roda antes da cópia — mesmo em tabela pré-existente. 🟢
- Falha isolada num `ALTER TABLE ... SET DEFAULT` de uma coluna específica não aborta as demais colunas nem a cópia da tabela — mas essa falha vira apenas `warn()` no terminal, sem `Issue` estruturada nem campo de erro no dict de resultado (não aparece em `report.json`/`report.html`). 🟡 Lacuna de observabilidade — ver `design.md`, Riscos e Lacunas.
- FK removida por segurança (1215/6125) só é restaurada se, no momento pós-carga, a coluna referenciada não tiver valores duplicados — caso contrário fica `FK_NOT_RESTORED` permanentemente (o script não repete a tentativa depois). 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Extrair todas as tabelas do banco de origem via `information_schema.TABLES` + `SHOW CREATE TABLE` | Must | Toda tabela existente no banco de origem aparece na lista extraída, com DDL completo ou `extract_error` |
| RF-02 | Permitir seleção de quais tabelas migrar (todas ou lista de nomes exatos) | Must | `select_items`/`tables.select` filtra corretamente por nome |
| RF-03 | Aplicar as 5 transformações estáticas de `TABLE_TRANSFORMATIONS`, mais `fix_table_engine_to_innodb` quando `force_innodb=true` | Must | Cada `Issue` esperada é gerada quando o padrão correspondente está presente no DDL; engine só muda para InnoDB com a flag explícita |
| RF-04 | Permitir `skip_create` (assume esquema de destino já existente, só copia dados) | Should | Com `skip_create=true`, nenhum `CREATE`/`DROP TABLE` é emitido, e `applied=true` sem DDL aplicado |
| RF-05 | Recuperar automaticamente de erro 1215/6125 removendo a FK própria e/ou FKs órfãs de outras tabelas, registrando `fk_specs` estruturados | Must | Tabela com FK problemática é criada com sucesso após a recuperação, e as FKs removidas ficam disponíveis para restauração posterior |
| RF-06 | Copiar dados em lotes de 500 linhas via `fetchmany`/`executemany`, com filtro `WHERE` opcional por tabela | Should | `rows_copied` reflete o total real copiado; filtro restringe corretamente o `SELECT` de origem |
| RF-07 | Aplicar valor padrão configurado por tabela/coluna, tanto como `DEFAULT` real no destino quanto por substituição de `NULL` em memória antes do `INSERT` | Should | Linha de origem com `NULL` na coluna configurada é inserida com o valor de fallback, sem erro de `NOT NULL`; coluna do destino fica com o `DEFAULT` setado |
| RF-08 | Tentar restaurar, ao final, cada FK removida durante a migração, checando duplicidade antes | Should | FK sem duplicata na coluna referenciada é restaurada (`FK_RESTORED`); FK com duplicata fica `FK_NOT_RESTORED`, sem abortar a execução |
| RF-09 | Registrar resultado por tabela (`applied`/`skipped`/`apply_error`/`rows_copied`/`copy_error`) para o relatório final | Must | `table_results` contém uma entrada por tabela selecionada, com os campos corretos preenchidos |
| RF-10 🆕 | Registrar falha de `ALTER TABLE ... SET DEFAULT` numa coluna configurada como `Issue` estruturada (`COLUMN_DEFAULT_FAILED`, severidade `warning`), visível no relatório final — divergência deliberada do comportamento do legado (que só emite `warn()` de terminal), decidida em revisão de 2026-09-15 (`../questions.md#pergunta-5`) | Should | Falha isolada numa coluna gera uma `Issue` no resultado da tabela, aparecendo em `report.json`/`report.html`, sem abortar as demais colunas nem a cópia de dados |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Confiabilidade | Erro de criação/cópia numa tabela não aborta o lote — cada item segue isolado no loop de `main()` | `migrate_routines.py:1686-1995` | 🟢 |
| Confiabilidade | `ensure_connected` reconecta origem e destino antes de cada tabela — cópias longas podem deixar a conexão ociosa tempo suficiente para o servidor derrubá-la | `migrate_routines.py:325` | 🟢 |
| Performance | Cópia de dados em lotes fixos de 500 linhas (`BATCH_SIZE`), não configurável via CLI/config | `migrate_routines.py:54` | 🟢 |
| Auditabilidade | Toda transformação e toda FK removida/restaurada gera uma `Issue` ou `fk_specs` estruturado, não apenas um log solto (exceto a lacuna do `ALTER SET DEFAULT` — ver Regras de Negócio) | `migrate_routines.py:690` (`TABLE_TRANSFORMATIONS`), `:677-683`/`:789-796` (`fk_specs`) | 🟢 |
| Configurabilidade | Todo ponto de decisão interativo (seleção, `copy_data`, `skip_create`, `force_innodb`, filtros, `column_defaults`, restauração de FK) tem chave `--config` equivalente | `migrate_routines.py:1686-1995` | 🟢 |

> Inferido a partir do código. Sem timeout/paralelismo explícitos — tabelas são processadas sequencialmente, uma por vez.

## Critérios de Aceitação

```gherkin
Dado uma tabela de origem "pedidos" com FK para "clientes" cuja coluna referenciada não tem UNIQUE KEY no destino
Quando o operador seleciona "pedidos" para migração e confirma a aplicação
Então o CREATE TABLE inicial falha com erro 1215/6125
  E o script remove a FK problemática automaticamente e recria a tabela com sucesso
  E a FK removida fica registrada em fk_specs, pendente de restauração

Dado que todas as tabelas e dados já foram migrados, incluindo a FK pendente acima
Quando o operador confirma "restaurar foreign keys removidas"
  E a coluna referenciada em "clientes" não tem valores duplicados
Então uma UNIQUE KEY é criada em "clientes" e a FOREIGN KEY original é recriada em "pedidos"
  E o resultado da tabela recebe a issue FK_RESTORED (info)

Dado uma tabela de origem com uma linha contendo NULL numa coluna NOT NULL do destino
  E o operador configurou tables.column_defaults para essa tabela/coluna com um valor literal
Quando os dados são copiados
Então a linha é inserida com o valor configurado no lugar do NULL, sem erro de sql_mode estrito
  E a coluna do destino fica com esse valor como DEFAULT real
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|----------------|
| Extração + transformação + criação de esquema (RF-01, RF-03) | Must | Caminho crítico — sem isso não há migração de estrutura |
| Recuperação automática de FK (RF-05) | Must | Núcleo de negócio mais complexo do projeto; sem isso, schemas legados com FK "mal formada" travam tabela a tabela |
| Registro de resultado por tabela (RF-09) | Must | Alimenta o relatório final, requisito central da ferramenta |
| Cópia de dados em lotes (RF-06) | Should | Migração schema-only já é um modo válido e suportado |
| Restauração de FK pós-carga (RF-08) | Should | Melhora integridade referencial, mas a migração já é considerada bem-sucedida sem ela |
| `column_defaults` (RF-07) | Should | Resolve uma classe específica de erro de dados sujos; sem configuração, o `INSERT` falharia para essas linhas |
| `skip_create` (RF-04) | Could | Cenário específico (schema pré-criado), tem alternativa (deixar o CREATE rodar normalmente) |

> Prioridade inferida por posição na cadeia de dependências e centralidade no propósito da ferramenta (ver CLAUDE.md, "Project Overview").

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `migrate_routines.py:388` | `fetch_tables` | 🟢 |
| `migrate_routines.py:575-648` | `fix_table_utf8`, `fix_table_type_keyword`, `fix_table_myisam_options`, `fix_table_engine_to_innodb`, `fix_table_zerofill`, `fix_table_int_display_width` | 🟢 |
| `migrate_routines.py:690` | `TABLE_TRANSFORMATIONS` | 🟢 |
| `migrate_routines.py:699` | `transform_table_ddl` | 🟢 |
| `migrate_routines.py:659` | `strip_foreign_keys` | 🟢 |
| `migrate_routines.py:761` | `find_referencing_fks` | 🟢 |
| `migrate_routines.py:812` | `drop_referencing_fks` | 🟢 |
| `migrate_routines.py:839` | `apply_table` | 🟢 |
| `migrate_routines.py:901` | `resolve_pending_foreign_keys` | 🟢 |
| `migrate_routines.py:984`, `:991` | `_resolve_default_value`, `_sql_literal` | 🟢 |
| `migrate_routines.py:995` | `copy_table_data` | 🟢 |
| `migrate_routines.py:1686-1995` | orquestração em `main()` | 🟢 |
