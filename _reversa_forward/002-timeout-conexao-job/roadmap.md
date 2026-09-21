# Roadmap: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Requirements: `_reversa_forward/002-timeout-conexao-job/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

O timeout de conexão (30s) e o retry (3 tentativas, sem backoff) entram como um loop interno em `connectionManager.ts:connect()`, não no `jobRunner.ts` — assim todo chamador (rotinas, tabelas, e futuras features como `reports`/`collation_fix`) ganha a proteção de graça, sem duplicar lógica. `ensureConnected` passa a reaproveitar esse mesmo `connect()` em vez de chamar `mysql.createConnection` puro. A parte não trivial não é o timeout em si — é que, hoje, quando um job falha inteiro (`runJob`, `jobRunner.ts:229-233`), a única coisa persistida é `status: 'failed'`; não existe coluna de mensagem de erro em `migration_jobs`, e o `logger` (`src/core/logger.ts`) só escreve em `stdout`, não persiste. Sem endereçar isso, o RF-04 ("mensagem de erro clara") fica sem lugar para morar depois que o processo termina. A feature inclui, portanto, uma migração pequena (`migration_jobs.error_message`) e o wiring para preenchê-la e expô-la via `GET /{feature}/jobs/:id`.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto — nenhum princípio formal a verificar. n/a.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Timeout de conexão (30s) e retry (3 tentativas, sem backoff, decidido em `/reversa-clarify`) implementados dentro de `connectionManager.ts:connect()` como loop interno, não em `jobRunner.ts` | Múltiplas features (`routines`, `tables`, e futuramente `reports`/`collation_fix`) chamam `connectionManager` diretamente; colocar o retry no `jobRunner` exigiria replicar a lógica em cada `FeatureRunner` | Implementar o retry dentro de cada `FeatureRunner`; implementar no `jobRunner.runJob` (não tem visibilidade de "qual chamada de conexão específica" falhou) | 🟢 |
| D-02 | `ensureConnected` (`connectionManager.ts:74-87`) para de chamar `mysql.createConnection` puro e passa a delegar para o `connect()` já com timeout+retry quando precisa reconectar; o `conn.ping()` em si (sem timeout nativo no `mysql2`) é envolvido num `Promise.race` contra o mesmo teto de 30s | Reaproveita D-01 em vez de duplicar o loop de retry; resolve a lacuna de `ping()` sem timeout identificada no requirements (RF-03) | Implementar um segundo mecanismo de timeout específico para `ping()`, dessincronizado do valor de `connect()` | 🟡 |
| D-03 | Nova coluna `migration_jobs.error_message TEXT NULL`, preenchida no bloco `catch` de `runJob` (`jobRunner.ts:229-233`) com a mensagem do erro capturado, antes do `UPDATE ... SET status = 'failed'` | Hoje não existe nenhuma coluna de erro em `migration_jobs`, e o `logger` (`logger.ts:11-19`) só escreve em `stdout` (comentário no próprio arquivo já sinalizava isso como "ponto de extensão futuro", nunca implementado) — sem persistir a mensagem, o RF-04 ("mensagem de erro clara") não tem onde morar depois que o processo termina | Usar `job_items.apply_error` para guardar o erro — descartado porque uma falha de conexão pode ocorrer antes de qualquer `job_item` existir (ex.: falha ao conectar à origem antes mesmo de extrair a lista de itens a migrar); persistir logs completos (todas as tentativas, todos os níveis) numa tabela nova — descartado por ser mudança arquitetural maior que o gap relatado justifica | 🟢 |
| D-04 | `getJobStatus` (`jobRunner.ts:236-251`) passa a incluir `errorMessage: string \| null` no retorno, refletindo a nova coluna | Sem isso, a mensagem persistida por D-03 fica presa no banco, inacessível para a tela de status/resultado do wizard (`JobStatus.*`/`JobResult.*`, feature `001-frontend-wizard-migracao-web`) que consome `GET /{feature}/jobs/:id` | n/a — é a única forma de expor o dado já que não há outro endpoint de leitura de job | 🟢 |
| D-05 | Cada tentativa de reconexão (RF-06) é logada via `logger.warn`/`logger.error` já existente (linha de padrão em `connectionManager.ts:34`), incluindo número da tentativa (`1/3`, `2/3`, `3/3`) — sem persistência além do que D-03 já cobre para o erro final | Cobre o "Should" de observabilidade (RF-06) sem expandir escopo para um sistema de log persistido completo, que não foi pedido | Persistir cada tentativa individual em nova tabela — descartado, mesmo raciocínio de D-03 sobre escopo | 🟢 |

## 4. Premissas

Nenhuma — todas as `[DÚVIDA]` do `requirements.md` foram resolvidas antes deste plano (ver `requirements.md#9-esclarecimentos`).

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| Core — Connection Manager | `_reversa_sdd/migration/target_architecture.md` linha 47 (fundido de `migrate_routines.py:248-344`) | regra-alterada | `connect()` ganha `connectTimeout` (30s) + retry interno (3 tentativas); `ensureConnected` passa a reaproveitar `connect()` em vez de reconectar sem timeout |
| Core — Job Runner | `_reversa_sdd/migration/target_architecture.md` linha 49 (novo, substitui `main()` síncrono do legado) | regra-alterada (leve) | `runJob` passa a persistir `error_message` em `migration_jobs` no caminho de falha (`jobRunner.ts:229-233`); `getJobStatus` passa a devolver esse campo |
| Core — Output/Log | `_reversa_sdd/migration/target_architecture.md` linha 50 | não alterado | Continua só em `stdout` (JSON) — a persistência mencionada no comentário de `logger.ts` permanece não implementada; fora do escopo desta feature (ver D-05) |

## 6. Delta no modelo de dados

- Resumo: uma coluna nova (`migration_jobs.error_message`), sem impacto em nenhuma outra tabela. Sem remoção de campo.
- Detalhe completo em: `_reversa_forward/002-timeout-conexao-job/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `GET /{feature}/jobs/:id` (rotinas e tabelas — mesma função `getJobStatus`) | HTTP | `_reversa_forward/002-timeout-conexao-job/interfaces/job-status.md` |

## 8. Plano de migração

1. Criar `src/core/db/migrations/002_add_job_error_message.sql` com `ALTER TABLE migration_jobs ADD COLUMN error_message TEXT NULL;`
2. Rodar `npm run migrate` (mesmo comando já usado pela feature `001`, ver `onboarding.md` daquela feature) para aplicar em ambiente de desenvolvimento/homologação antes do deploy
3. Nenhum dado existente precisa de backfill — `error_message` nasce `NULL` para jobs já concluídos, comportamento aceitável (jobs antigos já finalizados não ganham retroativamente uma mensagem de erro)

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Timeout de 30s (RN-01) ainda assim interromper uma operação legítima que dependa de `ensureConnected` durante uma janela de rede lenta mas saudável | médio | baixo | Valor foi escolhido pelo operador em `/reversa-clarify` sabendo do trade-off (RNF de Resiliência, `requirements.md#6`); se se provar curto na prática, é um valor configurável de código (constante única), fácil de ajustar numa iteração futura |
| Retry de 3 tentativas sem backoff (RN-02) martelar um servidor MySQL já sobrecarregado em vez de dar alívio | baixo | baixo | Sem backoff, mas com o timeout de 30s por tentativa já embutindo um espaçamento natural (3 tentativas × até 30s = até 90s de janela total antes de desistir) — suficiente para o volume de uso interno declarado no brief da migração |
| Migração de schema (`002_add_job_error_message.sql`) esquecida antes do deploy do código que já escreve em `error_message` | alto | baixo | `onboarding.md` desta feature lista o passo explicitamente; `/reversa-coding` deve rodar a migração como parte do checklist de entrega, mesmo padrão já usado pela feature `001` |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
