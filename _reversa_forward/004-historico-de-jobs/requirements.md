# Requirements: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Hoje o `jobId` só existe na navegação em memória do wizard (estado de `web/src/wizard/state.*`) — se a aba fecha, dá refresh, ou o operador esquece de copiar o id antes de sair da tela de resultado, não há como recuperar aquele job depois, mesmo `migration_jobs`/`job_items` persistindo tudo no App DB. Esta feature adiciona uma listagem (`GET /jobs`) e uma tela de histórico no wizard, com link para o acompanhamento/resultado de cada job.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_forward/001-frontend-wizard-migracao-web/tech-debt-log.md#DEBT-004` | Gap original relatado: "sem tela de histórico simples (lista de jobs, com link para cada resultado) no wizard, já que é uma lacuna real que vai incomodar de novo assim que você não tiver mais o id salvo" | 🟢 |
| `src/core/jobRunner.ts` | Só existe `getJobStatus(jobId)` (busca por id único). Não há nenhuma função de listagem | 🟢 |
| `src/features/jobs/routes.ts` | Criado pela feature `003-cancelamento-de-job` (`POST /jobs/:id/cancel`) — já é o lugar natural para um `GET /jobs` transversal, mesmo raciocínio de `migration_jobs` ser genérico por `job.id`, independente da feature específica | 🟢 |
| `src/core/db/migrations/001_init.sql:20-32` | `migration_jobs` tem `feature`, `status` (com índice composto `ix_migration_jobs_feature_status`), `started_at`, `finished_at`, `created_by` — mas **não tem nenhuma coluna `created_at`**, diferente de `connection_profiles` (linha 15) e `job_reports` (linha 72), que têm `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`. Sem isso, não há campo confiável para ordenar "mais recente primeiro" — `started_at` é `NULL` para jobs que nunca chegaram a rodar (`pending`) | 🟢 |
| `web/index.html` | Já existe uma `<nav>` estática no topo com dois links (`#/profiles`, `#/wizard/step1`) — lugar natural para adicionar um terceiro link de histórico, sem precisar inventar um novo padrão de navegação | 🟢 |
| `web/src/router.ts`, `web/src/main.ts` | Roteador hash simples (`addRoute`); telas existentes (`jobStatus.ts` em `/jobs/:feature/:id`, `jobResult.ts` em `/jobs/:feature/:id/result`) já são os alvos naturais de link da nova tela de histórico | 🟢 |
| `_reversa_sdd/addenda/002-timeout-conexao-job.md`, `_reversa_sdd/addenda/003-cancelamento-de-job.md` (ambos vigentes) | Confirmam que `errorMessage` (feature `002`) e o status `cancelled` acionável (feature `003`) já existem — a listagem deve poder exibir ambos | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador (via wizard web, único stakeholder declarado — Área de Infraestrutura) | Encontrar um job disparado anteriormente sem depender de ter guardado o `jobId` | Fecha a aba do wizard por engano logo após confirmar um job, ou quer checar "o que rodou ontem" — abre a tela de histórico e encontra o job pela lista, sem precisar do id |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** A listagem de jobs é ordenada por "mais recente primeiro" usando uma coluna nova `migration_jobs.created_at` (`TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`, mesmo padrão de `connection_profiles`/`job_reports`) — decidido em `/reversa-clarify` (2026-09-21). 🟢
   - Origem no legado: nenhuma (capacidade nova); gap técnico identificado por comparação direta com `connection_profiles`/`job_reports`, que já têm esse padrão.
   - Tipo: nova (decorrente de uma lacuna de schema pré-existente que só se torna visível ao construir esta feature)
2. **RN-02:** A listagem não substitui nem duplica os dados já expostos por `GET /{feature}/jobs/:id` — mostra um resumo por linha (feature, status, datas, quem disparou), o detalhe completo continua vindo do endpoint existente ao clicar num item. 🟢
   - Origem no legado: nenhuma (capacidade nova).
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Endpoint `GET /jobs` (transversal, mesmo arquivo `src/features/jobs/routes.ts` da feature `003`) lista os 50 jobs mais recentes por `created_at DESC` (coluna nova, RN-01), sem paginação nesta entrega | Must | Chamar o endpoint após criar 2+ jobs retorna todos, com o mais recente primeiro (por `created_at`, não por `started_at`); com mais de 50 jobs no banco, retorna só os 50 mais recentes | 🟢 |
| RF-02 | Cada item da listagem inclui: `id`, `feature`, `status`, `startedAt`, `finishedAt`, `createdBy`, `errorMessage` (quando `failed`), e os labels legíveis de origem/destino via `JOIN` com `connection_profiles` (`sourceProfileLabel`, `targetProfileLabel`) | Must | Resposta contém todos esses campos por item, incluindo os labels de perfil já resolvidos, sem exigir chamada adicional para exibir a listagem | 🟢 |
| RF-03 | Tela de histórico (`web/src/screens/jobHistory.ts`, nova) lista os jobs consumindo `GET /jobs`, com link para a tela de acompanhamento (`/jobs/:feature/:id`) de cada item | Must | Clicar num item da lista navega para a tela correta, que já existe desde a feature `001` | 🟢 |
| RF-04 | Link "Histórico" adicionado à `<nav>` estática de `web/index.html`, ao lado de "Perfis de conexão" e "Nova migração" | Should | Link visível e navegável a partir de qualquer tela | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | A listagem deve usar o índice já existente (`ix_migration_jobs_feature_status`) quando filtros de `feature`/`status` forem aplicados | Índice já existe no schema, sem custo adicional de criação | 🟢 |
| Escopo | Sem autenticação/autorização própria — mesma postura de BR-HUMANA-002/BR-HUMANA-005 (perímetro de rede/VPN como controle suficiente); qualquer operador vê o histórico de todos os jobs, não só os que criou | Consistente com o resto do wizard, que não tem conceito de usuário autenticado | 🟢 |
| Escopo (paginação) | Sem `limit`/`offset`/cursor nesta entrega — o endpoint sempre retorna os 50 mais recentes; jobs além desse limite ficam inacessíveis pela listagem (ainda acessíveis por `GET /{feature}/jobs/:id` se o `jobId` for conhecido) | Decisão explícita em `/reversa-clarify` (2026-09-21), apoiada na premissa de volume baixo já usada em `BR-HUMANA-002` | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Operador encontra um job antigo sem ter o jobId salvo
  Dado que existem 3 jobs criados anteriormente (2 completed, 1 failed)
  Quando o operador abre a tela de histórico
  Então vê os 3 jobs listados, o mais recente primeiro
  E consegue clicar num deles para ver o acompanhamento/resultado, sem ter digitado nenhum jobId

Cenário: Histórico vazio não quebra a tela
  Dado que nenhum job foi criado ainda
  Quando o operador abre a tela de histórico
  Então vê uma mensagem indicando que não há jobs, sem erro na tela
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01, RF-02, RF-03 | Must | Núcleo do gap relatado (DEBT-004) — sem isso a tela de histórico não existe |
| RF-04 | Should | Sem o link na nav, a tela existe mas fica inacessível para quem não sabe a URL de cor |

## 9. Esclarecimentos

### Sessão 2026-09-21

- **Q:** Sem coluna `created_at` em `migration_jobs`, não há campo confiável para ordenar "mais recente primeiro". O que fazer?
  **R:** Adicionar `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` (mesmo padrão de `connection_profiles`/`job_reports`) — opção (a).
- **Q:** Paginação: dado o volume baixo de uso declarado no brief, é aceitável retornar só os N mais recentes sem paginação real?
  **R:** Sim, sem paginação nesta entrega — N = 50 (valor sugerido na pergunta, aceito pelo operador) (opção a).
- **Q:** A listagem deve mostrar só os ids de perfil, ou fazer `JOIN` com `connection_profiles` para exibir o label legível de origem/destino direto na tabela?
  **R:** `JOIN` com `connection_profiles` para mostrar o label direto na listagem (opção b).

## 10. Lacunas

Nenhuma lacuna pendente — as 3 dúvidas do documento inicial foram resolvidas em `/reversa-clarify` (sessões de 2026-09-21, ver Esclarecimentos acima).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-09-21 | `/reversa-clarify`, sessão 1: resolvida DÚVIDA-1 (adicionar `created_at`) | reversa |
| 2026-09-21 | `/reversa-clarify`, sessão 2: resolvidas DÚVIDA-2 (sem paginação, N=50) e DÚVIDA-3 (JOIN com connection_profiles) — zero `[DÚVIDA]` pendentes | reversa |
