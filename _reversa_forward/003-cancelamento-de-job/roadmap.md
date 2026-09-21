# Roadmap: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Requirements: `_reversa_forward/003-cancelamento-de-job/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

A sinalização de cancelamento reaproveita `migration_jobs.status` como única fonte de verdade — sem estado em memória novo, sem `AbortController`/`EventEmitter` compartilhado. Um endpoint transversal (`POST /jobs/:id/cancel`, pasta nova `src/features/jobs/`) grava `status = 'cancelled'`; o loop de cada `FeatureRunner` (`routines/service.ts`, `tables/service.ts`) passa a consultar esse status a cada iteração, via um novo `ctx.isCancelled()` exposto por `FeatureRunContext`. A parte não óbvia do plano é uma correção de bug latente que a feature expõe: hoje `runJob` faz `UPDATE ... SET status = 'completed'`/`'failed'` incondicionalmente após o `runner()` retornar — se um cancelamento for persistido enquanto o `runner()` ainda está em voo, esse `UPDATE` sobrescreveria `'cancelled'` de volta para `'completed'`/`'failed'`. A correção (D-02) é pré-requisito para a feature funcionar corretamente, não um extra.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto — nenhum princípio formal a verificar. n/a.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Sinalização de cancelamento via polling de `migration_jobs.status` (`SELECT status FROM migration_jobs WHERE id = ?`), exposta como `FeatureRunContext.isCancelled(): Promise<boolean>`, chamada no topo de cada iteração dos loops de `routines/service.ts:55` e `tables/service.ts:81` | `migration_jobs.status` já é a fonte de verdade persistida (AGG-MigrationJob); cada item já faz múltiplas queries MySQL reais (extract/apply/`ensureConnected`), então uma query leve adicional por item é overhead desprezível | Estado em memória (`Map<jobId, boolean>` ou `AbortController` por job) — descartado por duplicar a fonte de verdade sem ganho de performance perceptível, e por introduzir risco de vazamento de memória/inconsistência se o processo reiniciar com jobs "esquecidos" no mapa | 🟢 |
| D-02 | **Correção de bug pré-requisito**: os `UPDATE`s terminais de `runJob` (`jobRunner.ts:227` completed, `jobRunner.ts:229-233` failed — numeração pós-feature-`002`) passam a ter `WHERE id = ? AND status = 'running'`, nunca sobrescrevendo um job já `'cancelled'` | Sem essa guarda, um cancelamento persistido enquanto `runner()` ainda está em voo seria silenciosamente revertido pelo `UPDATE` incondicional que já existe — bug real, não hipotético, dado que `isCancelled()` só é checado entre itens (D-01), deixando uma janela onde `runner()` pode retornar logo após um cancelamento ser gravado | n/a — correção de bug, não escolha de design | 🟢 |
| D-03 | Novo endpoint transversal `POST /jobs/:id/cancel` em `src/features/jobs/routes.ts` (pasta nova), registrado em `app.ts` como `registerJobRoutes(app)` | `migration_jobs`/`job_items` já são genéricos por `job.id` (mesmo raciocínio que justificou `reports/` ser transversal); "controlar o lifecycle do job" é uma responsabilidade distinta de "gerar relatório" (`reports/`) e de "processar uma feature" (`routines/`/`tables/`) — não misturar | Colocar a rota dentro de `reports/routes.ts` (já transversal) — descartado por misturar duas responsabilidades não relacionadas | 🟢 |
| D-04 | `POST /jobs/:id/cancel`: `404` se o job não existe; `409` se está em qualquer status terminal (`completed`/`failed`/`cancelled`, sem exceção idempotente); `200 { id, status: "cancelled" }` se estava `pending`/`running` | Decidido em `/reversa-clarify` (2026-09-21) | Sucesso idempotente (200/204) ao cancelar um job já `cancelled` — descartado, decisão explícita do operador | 🟢 |
| D-05 | Confirmação do cancelamento na UI via `confirm()` nativo do browser — mesmo padrão já usado em `connectionProfiles.ts:68` para excluir um perfil | Decidido em `/reversa-clarify`; reaproveita um padrão já existente no código, sem introduzir componente de modal customizado nem dependência nova | Modal customizado (HTML/CSS próprio) — descartado, sobre-engenharia para uma confirmação simples que já tem precedente funcional no projeto | 🟢 |
| D-06 | Em `tables/service.ts`, a fase de restauração de FKs pendentes (`params.restoreRemovedFks`, linhas 163-186) é pulada quando `ctx.isCancelled()` for verdadeiro no fim do loop — mas `SET FOREIGN_KEY_CHECKS=1` (linha 189) continua rodando sempre, cancelado ou não | Job cancelado não deveria fazer trabalho adicional além de parar; mas desabilitar `FOREIGN_KEY_CHECKS` sem reabilitar deixaria o banco de destino num estado perigoso para qualquer uso posterior — segurança do banco tem prioridade sobre "parar o mais rápido possível" | Pular também o `SET FOREIGN_KEY_CHECKS=1` — descartado, risco real de corromper integridade referencial de operações futuras no mesmo banco | 🟢 |

## 4. Premissas

Nenhuma — todas as `[DÚVIDA]` do `requirements.md` foram resolvidas antes deste plano (ver `requirements.md#9-esclarecimentos`).

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| Core — Job Runner | `_reversa_sdd/migration/target_architecture.md:49`; `_reversa_sdd/migration/target_domain_model.md:24` (comando `cancelar` já previsto) | regra-alterada | `FeatureRunContext` ganha `isCancelled()`; `runJob` ganha a guarda `status = 'running'` nos `UPDATE`s terminais (D-02, correção de bug) |
| routines (feature) | — | regra-alterada | `runRoutinesJob` (`routines/service.ts:55`) checa `ctx.isCancelled()` no topo do loop |
| tables (feature) | — | regra-alterada | `runTablesJob` (`tables/service.ts:81`) checa `ctx.isCancelled()` no topo do loop; fase de restauração de FKs pulada se cancelado (D-06) |
| jobs (feature, nova) | `_reversa_sdd/migration/target_domain_model.md:24` (comando `cancelar`) | contrato-novo | `POST /jobs/:id/cancel`, `src/features/jobs/routes.ts` |
| Cliente web — tela de acompanhamento | `_reversa_forward/001-frontend-wizard-migracao-web` (`jobStatus.ts`) | regra-alterada | Botão de cancelar com confirmação nativa (D-05), visível enquanto `pending`/`running` |

## 6. Delta no modelo de dados

- Nenhuma migração necessária: `migration_jobs.status` já é `ENUM(...,'cancelled')` desde `001_init.sql`. O delta é inteiramente de comportamento (quem escreve esse valor), não de schema.
- Detalhe completo em: `_reversa_forward/003-cancelamento-de-job/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `POST /jobs/:id/cancel` (novo) | HTTP | `_reversa_forward/003-cancelamento-de-job/interfaces/cancelamento-de-job.md` |

> `GET /{feature}/jobs/:id` não tem delta de contrato — `status: "cancelled"` já fazia parte do tipo de retorno desde a feature `001`; esta feature só passa a fato produzir esse valor.

## 8. Plano de migração

n/a — sem alteração de schema.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Janela entre o cancelamento ser persistido e o loop checar `isCancelled()` na próxima iteração — um item extra pode ser processado antes do loop parar | baixo | médio | Decisão de escopo já aceita em `/reversa-clarify` (RN-03) — cooperativo, não preemptivo. Não é regressão, é o comportamento pretendido |
| Esquecer a guarda `status = 'running'` (D-02) em algum outro ponto de escrita futuro de `migration_jobs.status` (ex.: se uma feature `collation_fix`/`config` ganhar seu próprio `FeatureRunner` depois) | médio | baixo | `runJob` é o único ponto que escreve os status terminais hoje — mitigado por centralização, não por disciplina de code review |
| Confirmação via `confirm()` nativo bloqueia a thread de UI (comportamento padrão do browser) | baixo | baixo | Mesmo padrão já em produção via `connectionProfiles.ts:68` — risco aceito, não introduzido por esta feature |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
