# Legacy Impact: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data da execução: `2026-09-21`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`, `src/core/**`, `tests/core/**` (os dois últimos adicionados pelo usuário especificamente para esta feature, na sessão)

## Arquivos afetados

| Arquivo afetado | Componente | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `src/core/db/migrations/002_add_job_error_message.sql` | Core — Job Runner (`_reversa_sdd/migration/target_architecture.md:49`) | delta-de-dados | LOW | Coluna nova aditiva (`migration_jobs.error_message`), `IF NOT EXISTS`, sem remoção nem backfill; não quebra leitura de nenhuma query pré-existente |
| `src/core/connectionManager.ts` | Core — Connection Manager (`_reversa_sdd/migration/target_architecture.md:47`, fundido de `migrate_routines.py:248-344`, `_reversa_sdd/code-analysis.md:30-32`) | regra-alterada | MEDIUM | `connect()` ganhou `connectTimeout` (30s) e retry interno (3 tentativas, sem backoff); `ensureConnected` passou a delegar reconexão para `connect()` e a envolver `conn.ping()` num teto de tempo. Efeito colateral: qualquer erro de conexão (incluindo os não recuperáveis por retry, como senha errada ou host inexistente) agora leva até 3x mais tempo para ser reportado — ver seção "Modificadas" |
| `src/core/jobRunner.ts` | Core — Job Runner (`_reversa_sdd/migration/target_architecture.md:49`) | regra-alterada + delta-de-contrato-externo | MEDIUM | `runJob` passou a persistir `error_message` no `catch` antes de marcar `failed` (D-03); `getJobStatus` passou a devolver `errorMessage` no payload — aditivo, não remove nenhum campo do contrato existente (`interfaces/job-status.md`) |
| `web/src/api.ts` | Cliente web (wizard, feature `001-frontend-wizard-migracao-web`) | delta-de-contrato-externo (espelho local) | LOW | `JobStatusResponse` ganhou `errorMessage: string \| null`, espelhando o backend. Campo aditivo, não quebra nenhum consumidor existente do tipo |
| `web/src/screens/jobStatus.ts` | Cliente web — tela de acompanhamento (RF-07 da feature `001`) | regra-alterada | LOW | Exibe `errorMessage` quando `status === "failed"`, escapado via `escapeHtml` (mesmo padrão de `step2.ts`/`connectionProfiles.ts`) |
| `web/src/screens/jobResult.ts` | Cliente web — tela de resultado final (RF-08 da feature `001`) | regra-alterada | LOW | Idem `jobStatus.ts`, na tela de resultado |
| `tests/core/connectionManager.test.ts` (novo) | Core — Connection Manager | n/a (teste) | n/a | 12 testes cobrindo RF-01, RF-03, RF-05, RN-02 |
| `tests/core/jobRunner.test.ts` (novo) | Core — Job Runner | n/a (teste) | n/a | 4 testes cobrindo D-03/D-04 |

## Diff conceitual por componente

**Core — Connection Manager.** Antes desta feature, `connect()` chamava `mysql.createConnection` sem nenhum timeout e sem retry — uma conexão morta (rede degradada, servidor travado sem fechar o socket) nunca gerava erro, deixando o job pendurado indefinidamente (DEBT-001 do episódio que originou esta feature). Agora `connect()` tenta até 3 vezes, cada uma com `connectTimeout: 30000`, propagando o último erro se todas falharem. `connectWithAutoCreateDatabase` não precisou de nenhuma mudança de código própria (T008): como já delegava suas duas conexões (a inicial e a administrativa de `CREATE DATABASE`) para `connect()`, herdou timeout e retry automaticamente. `ensureConnected` — chamado antes de cada tabela em cópias de dados longas — trocou sua reconexão manual por uma chamada a `connect()` (herdando retry), e passou a envolver `conn.ping()` num teto de 30s via um helper `withTimeout` local, porque o driver `mysql2` não expõe timeout nativo para `ping()`.

**Core — Job Runner.** Antes, quando `runJob` capturava uma exceção do `FeatureRunner`, a única coisa persistida era `status: 'failed'` — a mensagem do erro só existia em `stdout` (via `logger.error`), perdida assim que o processo terminava ou girava o log. Agora a mensagem é persistida em `migration_jobs.error_message` antes do `UPDATE` de status, e `getJobStatus` a expõe no payload consumido pelo wizard.

**Cliente web.** As telas de acompanhamento e resultado, que antes só mostravam o `status` final sem explicação, agora exibem a mensagem de erro quando o job falha — fechando o loop de UX que o RF-04 do `requirements.md` pedia ("operador precisa saber, pela tela, que o job falhou").

## Preservadas

Comportamentos 🟢 confirmados que permanecem intactos:

- O fluxo de auto-criação de banco no destino (erro 1049 → `CREATE DATABASE ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` → reconectar), confirmado em `_reversa_sdd/code-analysis.md:30` e coberto pela feature `001` — inalterado em lógica, só passou a herdar timeout/retry por composição.
- O propósito de `ensureConnected` (detectar conexão caída antes de operações longas, `_reversa_sdd/code-analysis.md:32`) — preservado, só ganhou um teto de tempo que ele não tinha.
- Todas as regras de negócio de migração (`_reversa_sdd/domain.md`, `_reversa_sdd/migration/target_business_rules.md`) — nenhuma tocada; esta feature é inteiramente de infraestrutura de conexão/job, não de regra de migração.
- O contrato de todos os campos pré-existentes de `GET /{feature}/jobs/:id` (`id`, `feature`, `status`, `startedAt`, `finishedAt`, `items`) — inalterados, `errorMessage` é puramente aditivo.

## Modificadas

- **Tempo até reportar erro de conexão não recuperável.** `connect()` não distingue erro "retryable" (timeout de rede) de erro "definitivamente não vai funcionar de novo" (senha errada, host inexistente, banco não autorizado) — ambos agora levam até 3 tentativas (≈ até 90s no pior caso) antes de serem reportados, contra 1 tentativa imediata antes desta feature. Não há regra 🟢 de `domain.md` documentando o tempo de resposta a erro de conexão (é comportamento de infraestrutura, sem equivalente no legado síncrono — `migrate_routines.py` nunca teve retry algum, só o `connection_timeout=10` de uma tentativa única). Decisão consciente do operador em `/reversa-clarify` (RN-02); registrado aqui porque é uma regressão perceptível de latência em cenários de erro de configuração (não de rede), mesmo não sendo uma regra de negócio formal.
- **`GET /{feature}/jobs/:id`** ganhou o campo `errorMessage` — aditivo, documentado em `interfaces/job-status.md`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-coding` | reversa |
