# migracao-de-rotinas — Tarefas de Implementação

> Sequência executável para reimplementar esta unit a partir do legado (`migrate_routines.py`), com rastreabilidade.

## Pré-requisitos

- [ ] Connection Manager (`connect`/`ask_connection`/`ensure_connected`) disponível e testado
- [ ] Config Resolver (`cfg`/`cfg_ask`/`cfg_confirm`/`select_items`) disponível
- [ ] Output Helpers (`info/ok/warn/error/header`) disponíveis
- [ ] Classe `Issue` definida (severidade `error`/`warning`/`info`)

## Tarefas

- [ ] T-01, Implementar `fetch_routines(conn, database)` — consulta `information_schema.ROUTINES` (nome, tipo, definer, charset, collation, sql_mode, corpo) e `SHOW CREATE PROCEDURE/FUNCTION` por rotina; capturar erro individual em `extract_error` sem abortar o lote
  - Origem no legado: `migrate_routines.py:345`
  - Critério de pronto: rodando contra um banco com N rotinas (algumas sem privilégio de leitura), retorna lista de N dicts, com `extract_error` preenchido só nas que falharam
  - Confiança: 🟢

- [ ] T-02, Implementar `remove_definer(ddl, new_definer=None)` — remove `DEFINER=\`x\`@\`y\`` via regex, ou substitui se `new_definer` for informado
  - Origem no legado: `migrate_routines.py:434`
  - Critério de pronto: DDL de entrada com DEFINER produz DDL de saída sem DEFINER (ou com o novo), gerando `Issue` `info`
  - Confiança: 🟢

- [ ] T-03, Implementar as 8 transformações da lista `TRANSFORMATIONS` (`fix_set_option`, `fix_old_password_hash`, `clean_sql_mode`, `fix_no_zero_date`, `fix_group_concat_maxlen`, `fix_sql_security`, `fix_no_default_charset`, `fix_only_full_group_by`) — ver tabela de severidade em `code-analysis.md`
  - Origem no legado: `migrate_routines.py:459-543`
  - Critério de pronto: cada função, dado um DDL com o padrão correspondente, retorna `(ddl_talvez_modificado, Issue)` com o `code`/`severity` esperado
  - Confiança: 🟢

- [ ] T-04, Implementar `transform_routine(ddl, new_definer=None)` — aplica `remove_definer` primeiro, depois cada transformação de `TRANSFORMATIONS` em sequência, acumulando `list[Issue]`
  - Origem no legado: `migrate_routines.py:555`
  - Critério de pronto: DDL com múltiplos padrões incompatíveis simultâneos produz uma `Issue` por padrão detectado, na ordem da lista
  - Confiança: 🟢

- [ ] T-05, Implementar `drop_if_exists(conn, database, name, rtype)` e `apply_routine(conn, database, ddl)`
  - Origem no legado: `migrate_routines.py:717`, `:728`
  - Critério de pronto: `apply_routine` retorna `None` em sucesso e a mensagem de erro (com rollback prévio) em falha
  - Confiança: 🟢

- [ ] T-06, Implementar orquestração: extração → seleção (`select_items`) → preview → confirmação → loop de aplicação por rotina → acumulação em `routine_results`
  - Origem no legado: `migrate_routines.py:1544-1685`
  - Critério de pronto: execução ponta a ponta contra um par origem/destino de teste produz `routine_results` com uma entrada coerente por rotina selecionada
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01, Teste do happy path: rotina com DEFINER + SET OPTION migra com sucesso, DDL final sem esses padrões (ver `requirements.md`, Critérios de Aceitação)
- [ ] TT-02, Teste do caso de erro: rotina sem `ddl_original` (extract_error) é marcada `skipped`, sem interromper as demais
- [ ] TT-03, Teste de `new_definer` configurado vs. não configurado (DEFINER removido vs. substituído)
- [ ] TT-04, Teste de falso positivo conhecido de `fix_only_full_group_by` (ver `design.md`, Riscos e Lacunas) — validar que é só `warning`, não bloqueia aplicação
- [ ] TT-05, Teste de `drop_existing=true` vs. `false` contra rotina já existente no destino

## Tarefas de Migração de Dados

N/A — esta unit não copia dados, apenas DDL de rotinas armazenadas.

## Ordem Sugerida

1. T-01 (extração) e T-02/T-03 (transformações puras) podem ser feitas em paralelo — não têm dependência entre si.
2. T-04 depende de T-02 e T-03 (compõe as duas).
3. T-05 (aplicação) é independente das transformações, mas precisa do Connection Manager pronto.
4. T-06 (orquestração) depende de T-01, T-04 e T-05 todos prontos — é o passo de integração final.

## Lacunas Pendentes (🔴)

- Não há teste automatizado no legado para validar as transformações contra casos reais de produção, e não há DDLs de produção anonimizados disponíveis para reaproveitar (confirmado com o operador em 2026-09-15, `../questions.md#pergunta-2`) — a suíte de testes da reimplementação precisa ser construída do zero, de forma sintética.
