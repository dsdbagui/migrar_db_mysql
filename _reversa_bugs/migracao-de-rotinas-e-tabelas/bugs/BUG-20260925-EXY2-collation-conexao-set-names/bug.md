---
schema_version: 1
id: BUG-20260925-EXY2
display_number: 1
title: Conexão de migração não define collation utf8mb4_0900_ai_ci antes do CREATE
status: resolved
phase: patching
severity: high
priority: P1
created: 2026-09-25
updated: 2026-09-25

origin:
  type: manual-report
  external_ref: null

area: migracao
module: connectionManager
feature: migracao-de-rotinas-e-tabelas
labels: [spec-gap]

visibility: normal
security_suspected: false

reproduction:
  classification: deterministic
  rate: "não testado ainda"
  suspected_triggers: []

blocking: []

relationships: []

traceability:
  specs:
    - "_reversa_sdd/addenda/bug-BUG-20260925-EXY2-v001.md#Seções-alvo"
  affected_code:
    - "src/core/connectionManager.ts#connect (linha 43-79)"
    - "src/features/tables/apply.ts#applyTable (linha 22-26)"
    - "src/features/routines/apply.ts#applyRoutine (linha 13-21)"
  root_cause:
    state: confirmed
    hypothesis: "mysql2 usa UTF8MB4_UNICODE_CI como charset padrão quando createConnection() não recebe charset/charsetNumber; connectionManager.ts não passava nenhum dos dois, para nenhuma conexão (origem ou destino)."
    causal_path:
      - "connectionManager.ts:connect() monta options sem charset/charsetNumber"
      - "mysql2/lib/connection_config.js:174-176 aplica options.charsetNumber || Charsets.UTF8MB4_UNICODE_CI"
      - "toda conexão (inclusive DESTINO) negocia collation_connection = utf8mb4_unicode_ci no handshake"
      - "CREATE TABLE/PROCEDURE/FUNCTION roda sob essa collation, divergente de utf8mb4_0900_ai_ci"
    evidence:
      - ref: "node_modules/mysql2/lib/connection_config.js:174-176"
        observation: "this.charsetNumber = options.charset ? getCharsetNumber(...) : options.charsetNumber || Charsets.UTF8MB4_UNICODE_CI — confirma o default exato relatado pelo usuário"
      - ref: "tests/core/connectionManager.test.ts (BUG-20260925-EXY2, antes da correção)"
        observation: "createConnectionMock chamado sem chave charset quando params não a define — reproduzido em vermelho, corrigido em verde"
    code_refs:
      - { file: "src/core/connectionManager.ts", symbol: "connect", commit: null }
  reproduction_tests:
    - "tests/core/connectionManager.test.ts > connect — charset da conexão (BUG-20260925-EXY2) > repassa params.charset para mysql.createConnection quando informado (uso: DESTINO)"
  regression_tests:
    - "tests/core/connectionManager.test.ts > connect — charset da conexão (BUG-20260925-EXY2) > não define charset quando params.charset está ausente (protege a ORIGEM, que pode ser MySQL 5.x)"
    - "tests/core/connectionManager.test.ts > connect — charset da conexão (BUG-20260925-EXY2) > DESTINATION_CHARSET é UTF8MB4_0900_AI_CI, mesma collation do CREATE DATABASE e das migrations do App DB"

spec_verdict: spec-gap

change_set:
  - id: CHG-001
    kind: code
    artifact: "src/core/connectionManager.ts, src/features/tables/service.ts, src/features/routines/service.ts, tests/core/connectionManager.test.ts"
    purpose: "Conexão de DESTINO passa a negociar charset UTF8MB4_0900_AI_CI no handshake; ORIGEM permanece sem override"
    diff: fix/CHG-001.diff

closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed

express: true
---

# Conexão de migração não define collation utf8mb4_0900_ai_ci antes do CREATE

## Summary

A conexão usada para aplicar `CREATE TABLE`/`CREATE PROCEDURE`/`CREATE FUNCTION` no destino não
define explicitamente o collation da sessão. Ela fica no default do driver/servidor (identificado
pelo usuário como `utf8mb4_unicode_ci`), em vez de `utf8mb4_0900_ai_ci`, o collation que o resto da
aplicação já assume como padrão do destino (ex.: `CREATE DATABASE ... COLLATE utf8mb4_0900_ai_ci`
em `connectionManager.ts:102`).

## Expected Behavior

Nenhuma spec em `_reversa_sdd/migracao-de-tabelas/requirements.md` ou
`_reversa_sdd/migracao-de-rotinas/requirements.md` define o collation da conexão — **spec-gap**.
O comportamento esperado, conforme pedido pelo usuário nesta rota expressa: antes de cada `CREATE`
(tabela ou rotina), a conexão deve rodar `SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci`, alinhando
com o collation do banco/tabelas de destino.

## Actual Behavior

`mysql.createConnection(...)` em `connectionManager.ts:49-57` não passa `charset` nem executa
`SET NAMES`. `applyTable`/`applyRoutine` rodam só `USE \`${database}\`` seguido do DDL — nenhum
`SET NAMES` no meio. `grep -rn "SET NAMES" src/` não retorna nenhuma ocorrência no projeto inteiro.

## Steps to Reproduce

1. Rodar uma migração de tabela ou rotina contra um destino MySQL 8 cujo `DEFAULT_COLLATION_NAME`
   seja `utf8mb4_0900_ai_ci`.
2. Inspecionar a coleção/rotina criada (`SHOW CREATE TABLE`/`SHOW CREATE PROCEDURE`, ou
   `information_schema.ROUTINES.DATABASE_COLLATION`).
3. Comparar com o collation que a conexão realmente usou no momento do `CREATE` (não testado ainda
   nesta rota expressa — falta reprodução isolada, ver Suspected Area).

## Evidence

Relato original do usuário: `../../intake/relato-20260925-1933.md` (seção "Problema 1").

## Suspected Area

- `src/core/connectionManager.ts` (`connect`) — ponto único de criação de conexão para tabelas e
  rotinas; nenhum `charset`/`collation` explícito é passado ao `mysql2`.
- `src/features/tables/apply.ts` (`applyTable`) e `src/features/routines/apply.ts` (`applyRoutine`)
  — executam `USE` + DDL sem `SET NAMES` antes.
- **Hipótese de impacto (não confirmada):** para rotinas, `CREATE PROCEDURE`/`FUNCTION` carimba
  `character_set_client`/`collation_connection`/`db_collation` como metadados da rotina no momento
  da criação (mesmo conceito de "carimbo de collation" documentado em
  `_reversa_sdd/domain.md` e tratado por `_reversa_sdd/correcao-de-collation/requirements.md`, que é
  um script DIFERENTE e não resolve isto). Se a `collation_connection` estiver errada no momento do
  `CREATE`, a rotina migrada pode nascer já com o carimbo desatualizado, exigindo o script de
  correção pós-migração para corrigir o que a própria migração deveria ter feito certo. Esta hipótese
  precisa ser confirmada na fase de diagnóstico do fix, não foi testada nesta rota expressa.

## Acceptance Criteria

```gherkin
Dado um destino MySQL 8 com DEFAULT_COLLATION_NAME = utf8mb4_0900_ai_ci
Quando uma tabela ou rotina é migrada
Então a conexão usada para o CREATE tem collation_connection = utf8mb4_0900_ai_ci no momento da criação
  E a tabela/rotina resultante não fica com collation divergente do destino
```

## Traceability

- Specs: nenhuma (spec-gap — ver Expected Behavior).
- Código afetado: ver Suspected Area.
- Causa raiz: não investigada ainda (preenchida pelo fix).
- Testes: nenhum ainda.

## Resolution

**Root cause (confirmed):** `mysql2` (`node_modules/mysql2/lib/connection_config.js:174-176`) aplica
`UTF8MB4_UNICODE_CI` como charset padrão da conexão sempre que `mysql.createConnection()` não recebe
`charset`/`charsetNumber`. `connect()` em `connectionManager.ts` não passava nenhum dos dois, para
nenhuma conexão — origem ou destino.

**Risco identificado durante a investigação:** `connect()`/`connectWithAutoCreateDatabase()` são
genéricas, usadas tanto para ORIGEM quanto para DESTINO. Forçar `utf8mb4_0900_ai_ci` (charset id 255,
só existe desde o MySQL 8.0.1) dentro de `connect()` incondicionalmente quebraria toda conexão com uma
ORIGEM em MySQL 5.x. A correção precisou ser escopada só ao DESTINO.

**Veredito de spec:** `spec-gap` — nenhuma seção de `migracao-de-tabelas/requirements.md` ou
`migracao-de-rotinas/requirements.md` tratava collation da conexão. Adendo aditivo gerado:
`_reversa_sdd/addenda/bug-BUG-20260925-EXY2-v001.md`.

**Change Set**

| CHG | Tipo | Artefato | Propósito |
|---|---|---|---|
| CHG-001 | code | `src/core/connectionManager.ts`, `src/features/tables/service.ts`, `src/features/routines/service.ts`, `tests/core/connectionManager.test.ts` | `ConnectionParams` ganha `charset?: string` opcional; `connect()` repassa para `mysql.createConnection()`; só as conexões de DESTINO (`runTablesJob`, `runRoutinesJob`, incluindo o caminho de reconexão via `ensureConnected`) passam `charset: DESTINATION_CHARSET` ("UTF8MB4_0900_AI_CI"); ORIGEM permanece sem override |

Diff completo: `fix/CHG-001.diff`.

**Testes (vermelho → verde):**

Vermelho (antes da correção, `tests/core/connectionManager.test.ts` + `tests/features/routines/transform.test.ts`):
```
FAIL tests/core/connectionManager.test.ts > ... > repassa params.charset para mysql.createConnection quando informado (uso: DESTINO)
  AssertionError: expected {…} to match object { charset: 'UTF8MB4_0900_AI_CI' } — chave charset ausente
FAIL tests/core/connectionManager.test.ts > ... > DESTINATION_CHARSET é UTF8MB4_0900_AI_CI...
  AssertionError: expected undefined to be 'UTF8MB4_0900_AI_CI'
```

Verde (depois da correção): `tests/core/connectionManager.test.ts` — 15/15 testes passando (2 novos +
1 de regressão específicos deste bug, 12 preexistentes intactos). Suíte completa relevante
(`connectionManager`, `routines/transform`, `tables/*`, `core/jobRunner`): 53/53 passando. `tsc -p
tsconfig.json --noEmit`: 0 erros novos (os 6 erros de `@fastify/cookie` são pré-existentes, confirmados
via `git stash` — ambiente local sem esse pacote instalado, sem relação com esta correção).

**resolution_kind:** `fixed`. `closure.satisfied: true` (closure policy `local-software`: regressão
passando + veredito de spec — ambos satisfeitos).

## Agent Notes

- Severidade (`high`) e prioridade (`P1`) assumidas pelo agente na rota expressa, sem confirmação
  explícita do usuário além do pedido de conserto — justificativa: se a hipótese de carimbo de
  collation em rotinas se confirmar, este defeito é a causa raiz de um problema que hoje só é
  corrigido depois, por um script separado (`correcao-de-collation`).
- `feature: migracao-de-rotinas-e-tabelas` é um valor novo no `taxonomy.yaml`, proposto e já semeado
  nesta sessão (representa a camada compartilhada de conexão entre as duas features existentes
  `migracao-de-rotinas` e `migracao-de-tabelas`).
- Registrado em conjunto com `BUG-20260925-GQ4N` (mesmo relato do usuário, mesmo contexto), mas são
  defeitos distintos em código distinto — nenhuma relação `caused-by`/`related-to` foi proposta entre
  eles nesta rota expressa (correlação pulada por regra da rota expressa).
