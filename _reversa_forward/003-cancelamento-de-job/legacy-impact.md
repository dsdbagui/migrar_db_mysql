# Legacy Impact: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data da execução: `2026-09-21`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`, `src/core/**`, `tests/core/**`, `src/features/jobs/**`, `tests/features/jobs/**`, `src/features/routines/**`, `src/features/tables/**` (os quatro últimos adicionados pelo usuário especificamente para esta feature, na sessão)

## Arquivos afetados

| Arquivo afetado | Componente | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `src/core/jobRunner.ts` | Core — Job Runner (`_reversa_sdd/migration/target_architecture.md:49`; comando `cancelar` já previsto em `target_domain_model.md:24`) | regra-alterada | HIGH | `FeatureRunContext` ganha `isCancelled()`; os dois `UPDATE`s terminais de `runJob` (`completed`/`failed`) ganham `AND status = 'running'` — **correção de bug**, não só feature nova: sem essa guarda, um cancelamento persistido enquanto `runner()` ainda está em voo seria silenciosamente revertido. Severidade HIGH porque, sem essa correção, a própria feature falharia silenciosamente em produção |
| `src/features/jobs/routes.ts` (novo) | jobs (feature, nova) | componente-novo + contrato-novo | MEDIUM | `POST /jobs/:id/cancel` — `404`/`409`/`200` conforme `interfaces/cancelamento-de-job.md` |
| `src/features/routines/service.ts` | routines (feature) | regra-alterada | MEDIUM | Loop de `runRoutinesJob` (linha 55, agora 58 após a inserção) checa `ctx.isCancelled()` antes de cada item e para sem erro |
| `src/features/tables/service.ts` | tables (feature) | regra-alterada | MEDIUM | Loop de `runTablesJob` checa `ctx.isCancelled()` antes de cada item; fase de restauração de FKs pendentes (`restoreRemovedFks`) é pulada se cancelado, mas `SET FOREIGN_KEY_CHECKS=1` continua rodando sempre (D-06) |
| `src/app.ts` | Composição da aplicação | contrato-novo (registro) | LOW | `registerJobRoutes(app)` adicionado ao lado dos demais registros de rota |
| `web/src/api.ts` | Cliente web | delta-de-contrato-externo (espelho local) | LOW | Novo método `cancelJob(jobId)` |
| `web/src/screens/jobStatus.ts` | Cliente web — tela de acompanhamento (RF-07 da feature `001`) | regra-alterada | LOW | Botão "Cancelar" com confirmação nativa (`confirm()`), visível enquanto `pending`/`running` |
| `tests/core/jobRunner.test.ts` | Core — Job Runner | n/a (teste) | n/a | 3 testes novos cobrindo `isCancelled()` e a guarda D-02 |
| `tests/features/jobs/routes.test.ts` (novo) | jobs (feature) | n/a (teste) | n/a | 7 testes cobrindo o contrato HTTP completo |

## Diff conceitual por componente

**Core — Job Runner.** Esta é a mudança de maior risco da feature, e não é o cancelamento em si — é a correção de uma condição de corrida que a introdução do cancelamento expõe. Antes, `runJob` só tinha dois desfechos possíveis (sucesso → `completed`, exceção → `failed`), e os `UPDATE`s finais eram incondicionalmente corretos porque nada mais escrevia `status` durante a execução. Ao introduzir um terceiro escritor concorrente (`POST /jobs/:id/cancel`), os `UPDATE`s incondicionais ganham uma janela de corrida real. A correção (`AND status = 'running'`) foi verificada por teste dedicado que falha (vermelho) sem o fix e passa (verde) com ele — ver `tests/core/jobRunner.test.ts`, describe "runJob — isCancelled() e guarda contra sobrescrever cancelamento".

**routines/tables (features).** Mudança mínima e mecânica: uma linha no topo de cada loop (`if (await ctx.isCancelled()) break;`). Em `tables/service.ts`, adicionalmente, a fase de restauração de FKs pendentes é condicionada ao mesmo `isCancelled()`, mas o `SET FOREIGN_KEY_CHECKS=1` final permanece incondicional — proteção deliberada contra deixar o banco de destino com checagem de integridade referencial desligada.

**jobs (feature nova).** Endpoint transversal simples, seguindo exatamente o precedente de `reports/routes.ts` (mesmo padrão de `fetchJobStatus`/status codes).

**Cliente web.** Adição aditiva de um botão de ação numa tela já existente, reaproveitando `confirm()` nativo (mesmo padrão de `connectionProfiles.ts:68`) — nenhuma dependência nova.

## Preservadas

Comportamentos 🟢 confirmados que permanecem intactos:

- BR-MIGRAR-003 (falha isolada não aborta o lote) — RN-02 desta feature é uma extensão direta do mesmo princípio para o caso de cancelamento, não uma alteração dele.
- O comportamento de `runJob` para os dois desfechos pré-existentes (`completed` sucesso, `failed` exceção) — inalterado para jobs que nunca são cancelados; a guarda `AND status = 'running'` é sempre satisfeita nesse caminho (o job está `running` desde a linha 216 até um desses dois `UPDATE`s, a menos que cancelado).
- Toda a lógica de extração/transformação/aplicação de rotinas e tabelas — nenhuma tocada, só o ponto de checagem entre itens foi adicionado.
- O contrato de `GET /{feature}/jobs/:id` — inalterado (o valor `"cancelled"` já fazia parte do tipo desde a feature `001`, feature `002` já o expunha via `errorMessage: null` implicitamente).

## Modificadas

- **`runJob` deixa de ser "dois escritores garantidos, sem corrida possível"** — passa a ter três desfechos concorrentes possíveis (completar, falhar, ser cancelado), com prioridade explícita para o cancelamento via `AND status = 'running'`. Não há regra 🟢 de `domain.md` de origem (comportamento de infraestrutura de job em background, que o legado síncrono nunca teve — mesma observação já feita em `002-timeout-conexao-job/legacy-impact.md` para o timeout).
- **`_reversa_sdd/migration/target_domain_model.md:24`** — o comando `cancelar`, previsto no design mas nunca implementado, passa de "planejado" para "implementado". Não é uma alteração da regra em si (ela já dizia isso desde 2026-09-15), é a primeira vez que o código a satisfaz.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-coding` | reversa |
