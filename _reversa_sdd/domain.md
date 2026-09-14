# Domínio — migra_db_mysql

> Gerado pelo Detective em 2026-09-02
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA — este documento é majoritariamente 🟡, pois o "porquê" de decisões de negócio raramente está explícito no código; foi inferido a partir de comportamento, nomes e comentários.

## Nota metodológica

O histórico Git deste repositório tem apenas **2 commits** (`6e7ffa9` "Initial commit: MySQL 5→8 migration tool" e `da7014a` "Add README"), ambos de 2026-08-21, sem histórico incremental de desenvolvimento — o código foi trazido já pronto para o repositório 🔴. Não há mensagens de commit de fix/hotfix, reverts ou refatorações para minerar como evidência de decisões de negócio. Também não há `TODO`/`FIXME`/`XXX` no código-fonte. Por isso, a arqueologia de negócio aqui se apoia quase inteiramente em **inferência a partir do comportamento do código** (nomes de funções, comentários de docstring, mensagens de erro tratadas), não em evidência histórica direta.

## Glossário

| Termo | Significado no domínio |
|---|---|
| **DDL** | *Data Definition Language* — o texto SQL de `CREATE PROCEDURE/FUNCTION/TABLE` retornado por `SHOW CREATE ...` |
| **DEFINER** | Usuário MySQL (`` `user`@`host` ``) registrado como "dono" de uma rotina armazenada; controla o contexto de segurança de execução quando `SQL SECURITY DEFINER` está em vigor |
| **Rotina** | Termo genérico para *procedure* ou *function* armazenada no MySQL |
| **Issue** | Um problema de compatibilidade MySQL 5→8 detectado (e, quando possível, corrigido automaticamente) numa transformação de DDL — ver `data-dictionary.md` |
| **Severidade (error/warning/info)** | `error` = quebraria a execução no MySQL 8 se não corrigido; `warning` = pode causar comportamento diferente, requer atenção humana; `info` = mudança cosmética/informativa, sem risco |
| **Carimbo de collation (`DATABASE_COLLATION`)** | Metadado gravado numa rotina armazenada no momento de sua criação, refletindo o collation do banco *naquele instante* — não é atualizado automaticamente quando o collation do banco muda depois; só um novo `CREATE` re-carimba |
| **FK órfã** | Foreign key que aponta para uma tabela que foi (ou está sendo) recriada, deixada por uma execução anterior do script — bloqueia a recriação da tabela referenciada mesmo com `FOREIGN_KEY_CHECKS=0` |
| **`skip_create`** | Modo de operação em que o script assume que o esquema de destino já existe (criado manualmente ou em execução anterior) e só executa a cópia de dados |
| **`force_innodb`** | Decisão explícita do operador de converter qualquer engine de tabela (tipicamente MyISAM, legado do MySQL 5) para InnoDB no destino |
| **Relatório de migração** | Artefato de auditoria gerado ao final de cada execução (`migration_report_<timestamp>/`) — não é um requisito funcional da migração em si, mas existe para rastreabilidade/conformidade |

## Regras de negócio implícitas

### Sobre DEFINER e portabilidade entre servidores
O DEFINER original é removido por padrão em toda migração (`migrate_routines.py:1450`). 🟡 Isso reflete uma prática comum de DBAs: o usuário `\`x\`@\`y\`` registrado como dono da rotina no servidor de origem provavelmente **não existe** (ou tem privilégios diferentes) no servidor de destino — manter o DEFINER original faria a rotina falhar ao executar ou ser aplicada. O operador pode opcionalmente fornecer um `new_definer` único para todas as rotinas migradas, mas não há suporte a mapear DEFINERs diferentes por rotina.

### Sobre a filosofia de correção automática vs. manual
Nem toda `Issue` detectada é corrigida automaticamente — compare `fix_set_option` (corrige e substitui o SQL) com `fix_old_password_hash` (apenas avisa, `"(sem alteração automática — requer revisão manual)"`). 🟡 O critério aparente: correções **sintáticas puras e sem ambiguidade semântica** (`SET OPTION`→`SET`, `TYPE=`→`ENGINE=`) são aplicadas automaticamente; problemas que exigem uma **decisão de negócio** (qual algoritmo de hash substitui `OLD_PASSWORD()`? qual charset é o correto para os dados existentes?) ficam como aviso para o humano decidir.

### Sobre TINYINT(1) e display width
`fix_table_int_display_width` explicitamente **preserva** `TINYINT(1)` ao remover display width de outros inteiros (`migrate_routines.py:591-600`, comentário no próprio código). 🟢 Confirmado: a razão documentada inline é que `TINYINT(1)` é convenção estabelecida em ORMs para representar boolean — removê-lo mudaria a semântica observável do schema para ferramentas downstream, não é puramente cosmético como nos outros tipos inteiros.

### Sobre a estratégia de recuperação de FK (o núcleo de negócio mais elaborado do projeto)
O MySQL 8 é mais rigoroso que o MySQL 5 quanto a exigir uma `UNIQUE KEY` na coluna referenciada por uma `FOREIGN KEY` (erros 1215/6125). Em vez de simplesmente falhar e exigir intervenção manual tabela por tabela, o script:
1. Remove a FK problemática automaticamente para não bloquear a migração do restante do schema (prioriza **completar a migração de estrutura e dados** sobre preservar integridade referencial imediatamente) 🟡
2. Tenta **restaurar** a FK depois que os dados já foram carregados, checando primeiro se é seguro (sem duplicatas na coluna referenciada) 🟢

Isso revela uma prioridade de negócio implícita: **dados e estrutura primeiro, integridade referencial estrita depois, best-effort** — aceitável para uma ferramenta de migração pontual, mas significa que uma migração "bem-sucedida" pode terminar com FKs não restauradas (avisadas como `FK_NOT_RESTORED`, não como erro fatal).

### Sobre o "carimbo" de collation como problema separado
`fix_collation_stamp.py` existe como ferramenta **separada e posterior** a uma migração — o cenário de negócio implícito é: o time migra o banco, converte o collation do schema (`ALTER DATABASE ... COLLATE ...`) como etapa distinta, e só depois roda este script para sincronizar as rotinas armazenadas com o novo collation. 🟡 O script recusa-se a rodar se o banco ainda não foi convertido (`fix_collation_stamp.py:374`) — uma salvaguarda que sugere que essa ordem de operações já causou confusão/erro de uso no passado (não confirmável via git, mas é o tipo de guarda que normalmente nasce de um incidente).

### Sobre relatório em 3 formatos
O relatório é gerado em JSON (para reprocessamento automatizado / integração), HTML (para leitura humana sem depender de nenhuma ferramenta instalada) e SQL com issues como comentários (para auditoria/revisão do DBA linha a linha). 🟡 Sugere que os consumidores do relatório são heterogêneos: pelo menos um humano (DBA revisando o resultado) e potencialmente um processo automatizado (retry via `retry_*.sql`).

## Máquinas de estado

Ver `state-machines.md` — o "item de migração" (rotina ou tabela) tem um ciclo de vida com estados observáveis nos dicts de resultado (`applied`/`skipped`/erro), mesmo sem uma classe de domínio formal representando esse estado.

## Permissões e papéis

Ver `permissions.md` — não há RBAC de aplicação (é uma ferramenta CLI operada por um DBA/operador); "permissões" neste domínio significa privilégios MySQL do usuário de conexão e o contexto de segurança `DEFINER`/`INVOKER` das rotinas migradas.

## Lacunas identificadas 🔴

- Não há forma de confirmar, sem acesso ao autor original ou a um histórico Git mais completo, **por que** certas escolhas de severidade foram feitas (ex: por que `GROUP_CONCAT` é só `warning` e não uma verificação mais profunda do valor de `group_concat_max_len` real do servidor de destino).
- Não há teste automatizado nem changelog — não é possível confirmar se as regras de transformação foram validadas contra casos reais de produção ou são heurísticas de melhor esforço.
- `.env.example` no repositório contém valores que parecem credenciais reais de rede interna (já sinalizado em `inventory.md`) — não é possível confirmar a intenção (exemplo real vs. vazamento acidental) sem confirmação humana.
