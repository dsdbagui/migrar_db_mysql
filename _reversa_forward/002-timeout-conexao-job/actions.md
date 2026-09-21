# Actions: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Roadmap: `_reversa_forward/002-timeout-conexao-job/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 14 |
| Paralelizáveis (`[//]`) | 5 |
| Maior cadeia de dependência | 6 (T001 → T005 → T010 → T011 → T012 → T013/T014) |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Criar migração `ALTER TABLE migration_jobs ADD COLUMN error_message TEXT NULL AFTER status;` (D-03) | - | `[//]` | `src/core/db/migrations/002_add_job_error_message.sql` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T002 | Escrever testes (vitest) para `connect()`: `connectTimeout` default de 30000ms (RF-01) e fallback para 30000ms quando o valor configurado é ausente/zero/negativo (RF-05) | - | `[//]` | `tests/core/connectionManager.test.ts` | 🟢 | `[X]` |
| T003 | Escrever teste (vitest) para retry de `connect()`: até 3 tentativas sem backoff antes de propagar o erro (RN-02); sucesso em qualquer tentativa dentro do limite não deve propagar erro | T002 | - | `tests/core/connectionManager.test.ts` | 🟢 | `[X]` |
| T004 | Escrever teste (vitest) para `ensureConnected`: timeout de `conn.ping()` via `Promise.race` contra o teto de 30s, e reconexão delegando para `connect()` já com retry (RF-03) | T003 | - | `tests/core/connectionManager.test.ts` | 🟡 | `[X]` |
| T005 | Escrever teste de contrato (vitest) para `runJob`: persiste `error_message` em `migration_jobs` no `catch` antes de marcar `failed`, e `getJobStatus` retorna `errorMessage` correspondente (D-03/D-04) | T001 | `[//]` | `tests/core/jobRunner.test.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | Implementar `connectTimeout` (default 30000ms) em `connect()`, com fallback para o default quando o valor recebido for ausente, zero ou negativo (RF-01, RF-05) | T002 | - | `src/core/connectionManager.ts` | 🟢 | `[X]` |
| T007 | Implementar retry interno em `connect()`: até 3 tentativas, sem backoff, logando cada tentativa via `logger.warn`/`logger.error` com o número da tentativa (RF-04 parcial, RF-06, D-05) | T006, T003 | - | `src/core/connectionManager.ts` | 🟢 | `[X]` |
| T008 | Aplicar o mesmo `connectTimeout`+retry (T006/T007) também na conexão administrativa usada por `connectWithAutoCreateDatabase` (RF-02) | T007 | - | `src/core/connectionManager.ts` | 🟢 | `[X]` |
| T009 | Reescrever `ensureConnected` para delegar a reconexão a `connect()` (herdando timeout+retry) e envolver `conn.ping()` num `Promise.race` contra o mesmo teto de 30s (RF-03, D-02) | T007, T004 | - | `src/core/connectionManager.ts` | 🟡 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T010 | No `catch` de `runJob`, persistir a mensagem do erro capturado em `migration_jobs.error_message` antes do `UPDATE ... SET status = 'failed'` (D-03) | T001, T005 | - | `src/core/jobRunner.ts` | 🟢 | `[X]` |
| T011 | Incluir `errorMessage: string \| null` no retorno de `getJobStatus`, lido da coluna nova (D-04) | T010 | - | `src/core/jobRunner.ts` | 🟢 | `[X]` |
| T012 | Adicionar `errorMessage: string \| null` à interface `JobStatusResponse` do cliente web, em paridade com `interfaces/job-status.md` | T011 | - | `web/src/api.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T013 | Exibir `errorMessage` na tela de acompanhamento quando `status === "failed"` | T012 | `[//]` | `web/src/screens/jobStatus.ts` | 🟡 | `[X]` |
| T014 | Exibir `errorMessage` na tela de resultado final quando `status === "failed"` | T012 | `[//]` | `web/src/screens/jobResult.ts` | 🟡 | `[X]` |

## Notas de execução

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-to-do` | reversa |
