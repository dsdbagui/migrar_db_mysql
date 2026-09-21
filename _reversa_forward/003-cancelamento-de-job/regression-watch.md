# Regression Watch: Cancelamento de job

> Identificador: `003-cancelamento-de-job`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|-------------------------------|----------------------|---------------------|
| W001 | `legacy-impact.md § Arquivos afetados` (`src/features/jobs/routes.ts`); `interfaces/cancelamento-de-job.md` | `POST /jobs/:id/cancel` existe e produz `200` (pending/running → cancelled), `404` (inexistente), `409` (qualquer status terminal, sem exceção idempotente) | presença | Uma re-extração futura não encontra a rota `POST /jobs/:id/cancel`, ou algum dos três códigos de resposta deixa de bater com o especificado |
| W002 | `legacy-impact.md § Diff conceitual` (Core — Job Runner) | Os dois `UPDATE`s terminais de `runJob` (`completed` e `failed`) mantêm a cláusula `AND status = 'running'` — nunca sobrescrevem um job já `cancelled` | presença | Uma edição futura em `jobRunner.ts` remove essa cláusula (ex.: durante uma refatoração que não conhece o motivo dela) — reabre o bug corrigido em D-02, sem nenhum teste quebrando a menos que `tests/core/jobRunner.test.ts` continue cobrindo o cenário |

## Observações

<!-- Itens sem peso de regressão: infraestrutura nova sem regra 🟢 de domain.md de origem, ou comportamento que ainda não foi confirmado por uma extração completa. -->

- **`runJob` passa a ter três desfechos concorrentes** (completar, falhar, ser cancelado) em vez de dois — mudança estrutural de complexidade sem regra 🟢 de `domain.md` de origem (infraestrutura de job em background, que o legado síncrono nunca teve).
- **`_reversa_sdd/migration/target_domain_model.md:24`** — o comando `cancelar`, previsto no design desde 2026-09-15, passou de "planejado" para "implementado" nesta feature. Não é uma regra que possa "regredir" no sentido usual (o texto do design não muda), é uma nota de rastreabilidade de que a lacuna foi fechada.
- **RF-01 a RF-06** (`_reversa_forward/003-cancelamento-de-job/requirements.md`): endpoint de cancelamento, checagem cooperativa nos dois loops, guarda de status, ação na UI. Todos implementados e cobertos por `tests/core/jobRunner.test.ts`/`tests/features/jobs/routes.test.ts` (10 testes novos verdes), mas ainda não confirmados por uma extração reversa (`/reversa`) completa sobre o código Node/TS — ganham peso de regressão formal quando uma futura re-extração os capturar.

## Histórico de re-extrações

_(vazio — preenchido pelo agente reverso na próxima execução de `/reversa` sobre este código)_

## Arquivadas

_(vazio)_
