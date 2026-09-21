# Requirements: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O status `cancelled` já existe no enum de `migration_jobs` e já é tratado como terminal pelo endpoint de relatório, mas nenhuma rota jamais escreve esse status — um job iniciado só termina sozinho (`completed`/`failed`), nunca por ação do operador. Esta feature adiciona um comando de cancelamento cooperativo: um endpoint marca o job como `cancelled`, e o loop de processamento de cada feature (`routines`, `tables`) para antes de iniciar o próximo item, sem interromper uma query já em andamento nem desfazer itens já aplicados.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/migration/target_domain_model.md:24` | O agregado `AGG-MigrationJob`, desenhado pelo Designer na etapa de migração, já previa **"Comandos aceitos: `iniciar`, `cancelar` (antes de terminar), `consultar progresso`"** — o comando de cancelar foi projetado mas nunca implementado na feature `001-frontend-wizard-migracao-web`. Esta feature fecha essa lacuna contra o próprio design já aprovado, não é uma ideia nova. | 🟢 |
| `src/core/jobRunner.ts:20` | `JobStatus` já inclui `"cancelled"` no enum desde o schema inicial (`001_init.sql`) | 🟢 |
| `src/features/reports/routes.ts:49` | O endpoint de relatório já trata `"cancelled"` como status terminal válido para gerar relatório — o sistema de leitura já assume que cancelamento é possível | 🟢 |
| `src/features/routines/service.ts:49-52`, `src/features/tables/service.ts:81-83` | Ambos os `FeatureRunner` (`runRoutinesJob`, `runTablesJob`) processam itens num loop `for (const item of selected) { ...; await ctx.onItem(item); }` — ponto natural para verificar um sinal de cancelamento entre itens. Hoje `FeatureRunContext` (`jobRunner.ts:48-56`) não expõe nenhum mecanismo desse tipo | 🟢 |
| `_reversa_sdd/addenda/002-timeout-conexao-job.md` | A feature anterior já entregou timeout de conexão (30s) + retry (3 tentativas) em `connectionManager.ts`. Relevante aqui porque limita o tempo que uma operação de *conexão* pode ficar pendurada — mas não limita a duração de uma *query* já em execução (cópia de dados), que continua sem teto | 🟢 |
| `_reversa_sdd/migration/risk_register.md#RISK-004` | Já estabeleceu que o progresso de um job é persistido incrementalmente por item (`onItem`/`persistItem`), não só ao final — o mesmo mecanismo que permite retomada após crash também é a base para "itens já aplicados sobrevivem ao cancelamento" (RN-02 abaixo) | 🟢 |
| `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-003` (falha isolada não aborta o lote) | Precedente direto: assim como um item com erro não desfaz os demais, um cancelamento não deve desfazer itens já aplicados antes dele — mesmo princípio de "o que já rodou, ficou rodado" | 🟢 |
| `_reversa_sdd/migration/target_architecture.md#AD-01` | Job roda sequencialmente dentro do próprio processo da aplicação, sem fila/broker externo — relevante porque não há mensageria para "avisar" o worker do pedido de cancelamento; o mecanismo exato de sinalização (polling do status no banco vs. estado em memória) fica para `/reversa-plan` decidir | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador (via wizard web, único stakeholder declarado — Área de Infraestrutura) | Interromper um job disparado por engano (feature/perfil errado) ou que está demorando mais do que o esperado, sem esperar terminar sozinho | Percebe, na tela de acompanhamento, que selecionou o perfil de destino errado; cancela o job antes que ele aplique mudanças em mais tabelas/rotinas do que o pretendido |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Um job em status `pending` ou `running` pode ser cancelado por comando explícito do operador; jobs em status terminal (`completed`, `failed`, `cancelled`) não podem ser cancelados de novo. 🟢
   - Origem no legado: `_reversa_sdd/migration/target_domain_model.md:24` (comando `cancelar` já previsto no design do agregado `AGG-MigrationJob`, "antes de terminar")
   - Tipo: nova (implementa um comando já desenhado, nunca codificado)
2. **RN-02:** Itens já persistidos com status terminal (`applied`, `skipped`, `error`) antes do momento do cancelamento permanecem inalterados — cancelar um job não desfaz nem reverte nenhum item já aplicado. 🟢
   - Origem no legado: `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-003` (falha isolada não aborta o lote) — extrapolada por analogia direta: assim como um erro isolado não desfaz os demais itens, um cancelamento também não desfaz o que já rodou.
   - Tipo: nova (extrapolação direta de uma regra já confirmada)
3. **RN-03:** O cancelamento é cooperativo, não preemptivo — o loop de processamento verifica o pedido de cancelamento entre itens, não interrompe uma query MySQL já em execução no meio de um item. Confirmado em `/reversa-clarify` (2026-09-21): interromper a query em voo (`connection.end()`/`KILL QUERY`) fica explicitamente fora do escopo desta entrega, candidato a iteração futura. 🟢
   - Origem no legado: nenhuma (capacidade nova); decisão de escopo registrada como debt original em `_reversa_forward/001-frontend-wizard-migracao-web/tech-debt-log.md#DEBT-002` ("exige um mecanismo de cooperação... já que não há cancelamento de query em voo sem o DEBT-001 resolvido primeiro" — DEBT-001 já foi resolvido pela feature `002`, mas isso resolve o *timeout de conexão*, não o cancelamento de uma query de cópia de dados já em execução, que é uma questão de escopo separada)
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Endpoint `POST /jobs/:id/cancel` (transversal, mesmo padrão de `/jobs/:id/report`) marca `migration_jobs.status = 'cancelled'` quando o job está em `pending` ou `running` | Must | Chamar o endpoint num job `running` retorna sucesso e o status muda para `cancelled` (verificável via `GET /{feature}/jobs/:id`) | 🟢 |
| RF-02 | Chamar o endpoint num job já em status terminal (`completed`/`failed`/`cancelled` — qualquer um dos três, sem exceção idempotente para `cancelled`) retorna `409 Conflict`, sem alterar o status existente | Must | Resposta `409` para os três status terminais, corpo com erro identificável; `GET /{feature}/jobs/:id` confirma que o status não mudou | 🟢 |
| RF-03 | O loop de processamento de `runRoutinesJob` e `runTablesJob` verifica o sinal de cancelamento antes de iniciar cada próximo item do lote e encerra o processamento sem lançar erro quando detecta cancelamento | Must | Cancelar um job com vários itens selecionados resulta em menos itens persistidos do que o total selecionado, sem nenhum item malformado ou com erro espúrio | 🟢 |
| RF-04 | Itens já persistidos (via `ctx.onItem`) antes do cancelamento continuam com seu status normal — nenhuma alteração retroativa a `job_items` | Must | Após cancelar, `GET /{feature}/jobs/:id` mostra os itens processados antes do cancelamento com seus status originais (`applied`/`skipped`/`error`), inalterados | 🟢 |
| RF-05 | A tela de acompanhamento do wizard (`web/src/screens/jobStatus.ts`) exibe uma ação de cancelar enquanto o job está em `pending`/`running`, com um modal de confirmação ("tem certeza?") antes de disparar a chamada | Should | Botão/ação visível durante o polling, desaparece assim que o job atinge um status terminal; clicar nele abre confirmação, e só chama `POST /jobs/:id/cancel` após confirmação explícita | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Resiliência | O tempo entre o pedido de cancelamento e o job efetivamente parar é limitado pelo item em andamento no momento — para itens presos numa etapa de *conexão*, o teto é o timeout de 30s já entregue pela feature `002` (`connectionManager.ts`); para itens numa *query* de cópia de dados já em execução, não há teto (RN-03) | Consequência direta da decisão de cancelamento cooperativo (não preemptivo) — ver DÚVIDA-1 para o trade-off completo | 🟢 |
| Idempotência | Chamar o endpoint de cancelamento mais de uma vez no mesmo job não produz efeito adicional — a partir da primeira chamada bem-sucedida, toda chamada seguinte (mesmo se já `cancelled`) retorna `409` (RF-02, decidido em `/reversa-clarify`: sem sucesso idempotente especial para `cancelled`) | Decisão explícita em `/reversa-clarify` (2026-09-21) — erro uniforme para qualquer status terminal | 🟢 |
| Auditoria | O evento de cancelamento deve ser identificável posteriormente (via `status: 'cancelled'` já é suficiente, sem exigir campo novo) — diferente de uma falha, não precisa de `error_message` (feature `002`), já que cancelamento é uma ação deliberada do operador, não um erro | Evita confundir "job cancelado pelo operador" com "job que falhou" na UI (`errorMessage` da feature `002` continua `null` num job `cancelled`) | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Operador cancela um job em execução e o processamento para antes do próximo item
  Dado um job `running` com múltiplos itens selecionados, dos quais alguns já foram processados
  Quando o operador chama `POST /jobs/:id/cancel`
  Então o job transiciona para `status: "cancelled"`
  E os itens processados antes do cancelamento mantêm seu status original em `job_items`
  E nenhum item adicional é processado após o cancelamento ser detectado

Cenário: Tentativa de cancelar um job que já terminou é rejeitada
  Dado um job em status `completed` (ou `failed`, ou já `cancelled`)
  Quando o operador chama `POST /jobs/:id/cancel`
  Então a chamada retorna um erro claro
  E o status do job permanece inalterado
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01, RF-03, RF-04 | Must | Núcleo do gap relatado (DEBT-002) — sem isso o enum `cancelled` continua morto, e um cancelamento malfeito poderia corromper itens já aplicados |
| RF-02 | Must | Sem essa validação, cancelar um job já terminado poderia mascarar um erro de operação (ex.: operador pensa que cancelou um job que na verdade já tinha falhado por outro motivo) |
| RF-05 | Should | UX necessária para o operador realmente usar a feature, mas o backend (RF-01..04) já entrega valor via API mesmo sem botão na primeira iteração |

## 9. Esclarecimentos

### Sessão 2026-09-21

- **Q:** Para um item de cópia de dados de tabela grande, o cancelamento pode levar minutos/horas para surtir efeito (não interrompe a query em execução). Isso é aceitável, ou o cancelamento precisa interromper a query em andamento?
  **R:** Aceitável nesta entrega — cancelamento só para entre itens; interromper query em voo fica para uma iteração futura (opção a).
- **Q:** Ao tentar cancelar um job que já está em status terminal, qual comportamento?
  **R:** `409 Conflict` para qualquer status terminal (`completed`/`failed`/`cancelled`) — erro uniforme, sem tratamento idempotente especial para `cancelled` (opção a).
- **Q:** O botão de cancelar no wizard deve pedir confirmação antes de disparar?
  **R:** Sim — modal "tem certeza?" antes de cancelar (opção a).

## 10. Lacunas

Nenhuma lacuna pendente — as 3 dúvidas do documento inicial foram resolvidas em `/reversa-clarify` (sessão de 2026-09-21, ver Esclarecimentos acima).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-09-21 | `/reversa-clarify`: resolvidas as 3 dúvidas (escopo do cancelamento cooperativo, `409` uniforme para status terminal, modal de confirmação na UI) — zero `[DÚVIDA]` pendentes | reversa |
