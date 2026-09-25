---
schema_version: 1
id: BUG-20260925-GQ4N
display_number: 2
title: cleanSqlMode não remove IGNORE_SPACE do sql_mode das rotinas migradas
status: resolved
phase: patching
severity: medium
priority: P2
created: 2026-09-25
updated: 2026-09-25

origin:
  type: manual-report
  external_ref: null

area: migracao
module: routines
feature: migracao-de-rotinas

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
    - "_reversa_sdd/migracao-de-rotinas/requirements.md#RF-04"
    - "_reversa_sdd/addenda/bug-BUG-20260925-GQ4N-v001.md#Seção-alvo"
  affected_code:
    - "src/features/routines/transform.ts#cleanSqlMode (linha 54-67, agora 76-93)"
  root_cause:
    state: confirmed
    hypothesis: "cleanSqlMode nunca implementou remoção de IGNORE_SPACE — é regra nova pedida pelo usuário, não regressão de comportamento documentado (CLAUDE.md já descrevia só NO_AUTO_CREATE_USER)."
    causal_path:
      - "cleanSqlMode testava só /NO_AUTO_CREATE_USER/i"
      - "IGNORE_SPACE nunca foi incluído na lista de tokens tratados"
    evidence:
      - ref: "src/features/routines/transform.ts:54-67 (antes da correção)"
        observation: "único regex e único replace, ambos específicos de NO_AUTO_CREATE_USER"
      - ref: "tests/features/routines/transform.test.ts (BUG-20260925-GQ4N, antes da correção)"
        observation: "DDL com IGNORE_SPACE isolado sai intocado; reproduzido em vermelho, corrigido em verde"
    code_refs:
      - { file: "src/features/routines/transform.ts", symbol: "cleanSqlMode", commit: null }
  reproduction_tests:
    - "tests/features/routines/transform.test.ts > cleanSqlMode > remove IGNORE_SPACE do sql_mode (BUG-20260925-GQ4N)"
  regression_tests:
    - "tests/features/routines/transform.test.ts > cleanSqlMode > remove NO_AUTO_CREATE_USER do sql_mode"
    - "tests/features/routines/transform.test.ts > cleanSqlMode > remove NO_AUTO_CREATE_USER e IGNORE_SPACE juntos, preservando os demais tokens"

spec_verdict: spec-gap

change_set:
  - id: CHG-001
    kind: code
    artifact: "src/core/issue.ts, src/features/routines/transform.ts, tests/features/routines/transform.test.ts"
    purpose: "cleanSqlMode passa a remover também IGNORE_SPACE (severidade info, token novo SQL_MODE_IGNORE_SPACE), preservando o tratamento existente de NO_AUTO_CREATE_USER (severidade error)"
    diff: fix/CHG-001.diff

closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed

express: true
---

# cleanSqlMode não remove IGNORE_SPACE do sql_mode das rotinas migradas

## Summary

A transformação `cleanSqlMode`, uma das 8 transformações de compatibilidade aplicadas a cada rotina
migrada (RF-04), só remove `NO_AUTO_CREATE_USER` do `sql_mode`. O usuário pediu que `IGNORE_SPACE`
também seja removido.

## Expected Behavior

`_reversa_sdd/migracao-de-rotinas/requirements.md#RF-04` exige aplicar "as 8 transformações de
compatibilidade da lista TRANSFORMATIONS, em ordem", mas não especifica quais tokens exatos de
`sql_mode` cada uma cobre — **spec-gap** quanto a `IGNORE_SPACE` especificamente. O comportamento
atual (só `NO_AUTO_CREATE_USER`) está de acordo com o que `CLAUDE.md` documenta hoje
("clean_sql_mode — removes NO_AUTO_CREATE_USER from sql_mode"), então isto não é uma regressão de
spec existente: é uma regra nova sendo pedida agora pelo usuário.

## Actual Behavior

`cleanSqlMode` (`src/features/routines/transform.ts:54-67`) testa só
`/NO_AUTO_CREATE_USER/i` e substitui só essa ocorrência via
`ddl.replace(/,?\s*NO_AUTO_CREATE_USER/gi, "")`. Nenhuma menção a `IGNORE_SPACE` existe na função
nem em nenhum outro lugar de `src/features/routines/`.

## Steps to Reproduce

1. Migrar uma rotina cujo `sql_mode` original inclua `IGNORE_SPACE` (ex.:
   `SET sql_mode='...,IGNORE_SPACE,...'` no `SHOW CREATE PROCEDURE` de origem).
2. Conferir o DDL aplicado no destino.
3. Esperado (pedido do usuário): `IGNORE_SPACE` ausente do `sql_mode` resultante. Observado: token
   permanece (não testado isoladamente nesta rota expressa, comportamento inferido da leitura do
   código-fonte).

## Evidence

Relato original do usuário: `../../intake/relato-20260925-1933.md` (seção "Problema 2").

## Suspected Area

- `src/features/routines/transform.ts` (`cleanSqlMode`, linha 54-67) — único ponto de limpeza de
  `sql_mode` na cadeia de `TRANSFORMATIONS`.

## Acceptance Criteria

```gherkin
Dado o DDL de uma rotina de origem cujo sql_mode contém IGNORE_SPACE (isolado ou junto de outros tokens)
Quando a rotina é transformada por cleanSqlMode
Então o sql_mode resultante não contém IGNORE_SPACE
  E os demais tokens do sql_mode permanecem intactos
  E uma Issue é registrada informando a remoção (mesmo padrão de NO_AUTO_CREATE_USER)
```

## Traceability

- Specs: `_reversa_sdd/migracao-de-rotinas/requirements.md#RF-04` (spec-gap quanto ao token específico).
- Código afetado: ver Suspected Area.
- Causa raiz: não investigada ainda (preenchida pelo fix) — é regra nova, não regressão.
- Testes: nenhum ainda.

## Resolution

**Root cause (confirmed):** `cleanSqlMode` nunca implementou remoção de `IGNORE_SPACE` — testava e
removia só `NO_AUTO_CREATE_USER`. Não é regressão: o comportamento documentado em `CLAUDE.md` já
descrevia só `NO_AUTO_CREATE_USER`; `IGNORE_SPACE` é regra nova pedida agora pelo usuário.

**Distinção importante preservada na correção:** `NO_AUTO_CREATE_USER` é mesmo inválido no MySQL 8
(severidade `error`). `IGNORE_SPACE` **continua válido** no MySQL 8 — é removido por decisão
operacional, não por incompatibilidade, por isso a `Issue` correspondente usa severidade `info`, não
`error`.

**Veredito de spec:** `spec-gap` — `RF-04` de `migracao-de-rotinas/requirements.md` cobre `cleanSqlMode`
como uma das 8 transformações, mas nunca detalhou `IGNORE_SPACE`. Adendo aditivo gerado:
`_reversa_sdd/addenda/bug-BUG-20260925-GQ4N-v001.md`.

**Change Set**

| CHG | Tipo | Artefato | Propósito |
|---|---|---|---|
| CHG-001 | code | `src/core/issue.ts`, `src/features/routines/transform.ts`, `tests/features/routines/transform.test.ts` | Novo `IssueCode` `SQL_MODE_IGNORE_SPACE`; `cleanSqlMode` reescrito para checar uma lista de tokens (`NO_AUTO_CREATE_USER` error, `IGNORE_SPACE` info), removendo todos os presentes e preservando os demais tokens do `sql_mode`. Quando os dois aparecem juntos, o `code` do Issue prioriza o mais severo, com a descrição citando ambos os tokens removidos |

Diff completo: `fix/CHG-001.diff`.

**Testes (vermelho → verde):**

Vermelho (antes da correção):
```
FAIL tests/features/routines/transform.test.ts > cleanSqlMode > remove IGNORE_SPACE do sql_mode (BUG-20260925-GQ4N)
  AssertionError: expected '...' not to contain 'IGNORE_SPACE' — token permanecia intocado
FAIL tests/features/routines/transform.test.ts > cleanSqlMode > remove NO_AUTO_CREATE_USER e IGNORE_SPACE juntos...
  AssertionError: expected '...' not to contain 'IGNORE_SPACE'
```

Verde (depois da correção): `tests/features/routines/transform.test.ts` — 17/17 testes passando (3
novos deste bug, 14 preexistentes intactos, incluindo o teste original de `NO_AUTO_CREATE_USER`
isolado, que continua com a mesma `description` de antes). `tsc -p tsconfig.json --noEmit`: 0 erros
novos.

**Nota de correção durante o próprio ciclo:** a primeira versão do teste combinado esperava
`issue?.code === "SQL_MODE_IGNORE_SPACE"` para o caso com os dois tokens juntos, inconsistente com a
implementação (que prioriza o código do token mais severo, `SQL_MODE_NO_AUTO_CREATE_USER`). Corrigido
no teste antes do fechamento — ver `fix/CHG-001.diff` (a versão final do teste já reflete a correção).

**resolution_kind:** `fixed`. `closure.satisfied: true` (closure policy `local-software`: regressão
passando + veredito de spec — ambos satisfeitos).

## Agent Notes

- Severidade (`medium`) e prioridade (`P2`) assumidas pelo agente na rota expressa: impacto mais
  contido que o BUG-20260925-EXY2 (ajuste pontual de regex numa função já existente, sem indício de
  efeito colateral em cascata).
- Registrado em conjunto com `BUG-20260925-EXY2` (mesmo relato do usuário, mesmo contexto de pasta),
  mas são defeitos distintos em código distinto — nenhuma relação `caused-by`/`related-to` foi
  proposta entre eles nesta rota expressa (correlação pulada por regra da rota expressa).
- Ao corrigir, preservar o padrão de `Issue` já usado por `NO_AUTO_CREATE_USER`
  (`SQL_MODE_NO_AUTO_CREATE_USER`, severidade `error`) — provavelmente um novo código de issue
  dedicado (ex. `SQL_MODE_IGNORE_SPACE`) em vez de reaproveitar o existente, para manter
  rastreabilidade por token removido.
