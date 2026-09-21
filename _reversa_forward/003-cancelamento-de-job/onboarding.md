# Onboarding: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Passo a passo para um humano testar esta feature pela primeira vez.

## Pré-requisitos

1. Mesmo ambiente das features `001`/`002` já rodando (ver `_reversa_forward/001-frontend-wizard-migracao-web/onboarding.md`). Nenhuma migração nova é necessária para esta feature (`data-delta.md`).
2. Um job que leve tempo suficiente para dar tempo de cancelar no meio — ex.: uma migração de `tables` com várias tabelas selecionadas e `copyData: true`, ou um MySQL de origem/destino propositalmente lento (rede local com latência artificial, se disponível).

## Passo a passo

1. Suba o backend (`npm run dev`).
2. Dispare um job de `tables` com pelo menos 3-4 tabelas selecionadas (quanto mais itens, mais fácil observar o cancelamento parando "no meio").
3. Assim que o job estiver `running` (confira via `GET /tables/jobs/:id` ou a tela de acompanhamento), chame `POST /jobs/:id/cancel`.
4. Confirme a resposta `200 { id, status: "cancelled" }`.
5. Consulte `GET /tables/jobs/:id` de novo — confirme que `status` é `"cancelled"` e que **não regrediu** para `"completed"`/`"failed"` (é exatamente o bug que D-02 do `roadmap.md` corrige — se você conseguir reproduzir uma regressão para `completed` depois de cancelar, é sinal de que a guarda `WHERE id = ? AND status = 'running'` não foi aplicada corretamente).
6. Confirme que `items` no retorno mostra menos itens do que o total selecionado no passo 2 — o processamento deve ter parado antes de terminar todos.
7. **Caso negativo — job já terminado**: dispare um job pequeno (poucos itens) e deixe-o concluir sozinho (`completed`). Chame `POST /jobs/:id/cancel` nele. Confirme `409`, com o status do job permanecendo `completed`.
8. **Caso negativo — job inexistente**: chame `POST /jobs/00000000-0000-0000-0000-000000000000/cancel`. Confirme `404`.
9. **Caso negativo — cancelar duas vezes**: repita o passo 3 duas vezes seguidas no mesmo job. A primeira chamada deve dar `200`; a segunda, `409` (RF-02, sem sucesso idempotente).
10. Se `restoreRemovedFks` estava habilitado no job cancelado (passo 2), confirme nos logs (`stdout`, `logger`) que a fase de restauração de FKs foi pulada (D-06) — nenhuma linha de log de `FK_RESTORED`/`FK_NOT_RESTORED` deve aparecer para esse job.
11. Na UI (depois que `/reversa-coding` implementar RF-05): abra a tela de acompanhamento de um job `running`, clique em "Cancelar", confirme o diálogo nativo do browser, e observe o job transicionar para `cancelled` no próprio polling da tela.

## Critério de sucesso do onboarding

- Passo 5: `status` permanece `cancelled` de forma estável, nunca reverte.
- Passo 6: processamento realmente parou antes de terminar todos os itens.
- Passos 7-9: os três casos negativos retornam o código de erro esperado, sem side effects.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
