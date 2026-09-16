# Roadmap: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Requirements: `_reversa_forward/001-frontend-wizard-migracao-web/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

O backend Node.js/TypeScript (commit `157ea45`) já expõe o contrato REST completo para `routines` e `tables` (CRUD de perfis, `preview`, `jobs`, `jobs/:id`) — o delta desta feature é majoritariamente client-side: um wizard multi-step que consome esse contrato existente sem alterá-lo, seguindo BR-HUMANA-001 (perfis → seleção → opções → preview → confirmação → acompanhamento). A única mudança de contrato de backend é nova: um endpoint de relatório (RF-10, decidido em sessão de `/reversa-clarify`) para a feature `reports`, hoje presente apenas como tabela `job_reports` sem rota. Autenticação fica deliberadamente fora do escopo (decisão confirmada: perímetro VPN é controle suficiente nesta entrega). Config/reports(wizard)/collation-fix como features de UI completas ficam fora — só rotinas e tabelas.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto — nenhum princípio formal a verificar. n/a.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | O wizard consome o contrato REST já implementado em `src/features/routines/routes.ts` e `src/features/tables/routes.ts` sem propor mudanças de payload/resposta | Contrato já em produção (commit `157ea45`), testado por `tests/` existentes; reescrevê-lo agora quebraria o incremento de backend já entregue | Redesenhar o contrato junto com o frontend | 🟢 |
| D-02 | Acompanhamento de job via polling simples (intervalo fixo, sem SSE/WebSocket) | Alinhado a AD-01 de `target_architecture.md` — decisão híbrida de paradigma, "sem fila/broker externo"; introduzir push em tempo real seria complexidade desproporcional para uso interno de baixo volume | Server-Sent Events; WebSocket | 🟢 |
| D-03 | Novo endpoint transversal de relatório (`/jobs/:id/report`, fora dos namespaces `/routines` e `/tables`) em vez de duplicar a rota dentro de cada feature | `migration_jobs`/`job_reports` já são genéricos por `job.id`, independente da feature (`001_init.sql`); um endpoint único evita duplicar a lógica de serialização entre `routines` e `tables`, coerente com BR-MIGRAR-016 (serializador único) | Rota aninhada `/routines/jobs/:id/report` e `/tables/jobs/:id/report` duplicadas | 🟡 |
| D-04 | Relatório suporta 4 variantes via `?format=json\|html\|sql\|retry` num único endpoint, com persistência em `job_reports` (upsert por `job_id`, respeitando `UNIQUE KEY uq_job_reports_job`) | Espelha a decisão de revisão já registrada em `_reversa_sdd/relatorios-de-migracao/design.md` ("consolidar sob serializador único... em vez de manter as três funções de renderização independentes do legado") | 4 endpoints separados (`/report.json`, `/report.html`, etc.) | 🟡 |
| D-05 | Sem tela de login/sessão nesta entrega; identificação do operador continua sendo o campo texto livre `createdBy` já existente em `CreateJobInput` | Decisão confirmada em sessão de `/reversa-clarify` (2026-09-16): perímetro de rede (VPN) é controle de acesso suficiente | Autenticação básica bloqueante | 🟢 |

## 4. Premissas

Nenhuma — todas as `[DÚVIDA]` do `requirements.md` foram resolvidas antes deste plano (ver `requirements.md#9-esclarecimentos`).

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| API / Wizard | `_reversa_sdd/migration/target_architecture.md#Componentes` | componente-novo | Cliente web multi-step consumindo os endpoints já existentes de `routines`/`tables`/`connection-profiles`; nenhum endpoint novo para esses três |
| features/reports | `_reversa_sdd/migration/target_architecture.md#Componentes` (BC-03) | contrato-novo | Hoje só existe a tabela `job_reports` (`001_init.sql`); esta feature adiciona `src/features/reports/routes.ts` + serializador único que lê `migration_jobs`/`job_items`/`job_item_fk_specs` e persiste `report_json`/`report_html`/`migration_sql`/`retry_sql` |
| Core — Job Runner | `src/core/jobRunner.ts` | regra-alterada (leve) | Nenhuma mudança de assinatura; passa a ser consumido indiretamente pelo novo serializador de `reports` como fonte de leitura (via `getJobStatus`-like query), não como escritor |
| App DB (`job_reports`) | `src/core/db/migrations/001_init.sql` | contrato-novo (uso) | Tabela já existe e não tinha nenhuma rota que a escrevesse/lesse; passa a ser preenchida pelo novo endpoint de `reports` |

## 6. Delta no modelo de dados

- Nenhuma migração de schema nova: `connection_profiles`, `migration_jobs`, `job_items`, `job_item_fk_specs` e `job_reports` já existem em `001_init.sql` e cobrem tudo que esta feature precisa. O único "delta" é comportamental — `job_reports` passa de tabela não utilizada para tabela ativa.
- Detalhe completo em: `_reversa_forward/001-frontend-wizard-migracao-web/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Relatório de job (`GET`/`POST /jobs/:id/report`) | HTTP | `_reversa_forward/001-frontend-wizard-migracao-web/interfaces/relatorio-de-job.md` |

> Os demais contratos consumidos pelo wizard (`/connection-profiles*`, `/routines/*`, `/tables/*`) já existem sem alteração — não geram arquivo de interface por não terem delta.

## 8. Plano de migração

n/a — feature nova, sem dado legado a migrar. O "legado" aqui (CLI Python) e a versão web coexistem via Strangler Fig por feature (`_reversa_sdd/migration/migration_strategy.md`, `cutover_plan.md`), já decidido em etapa anterior do pipeline de migração; esta feature não altera esse plano de corte.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Sem autenticação de aplicação (D-05), qualquer pessoa com acesso à VPN pode disparar `DROP`/`CREATE` contra bancos reais pelo wizard | alto | médio | Aceito nesta entrega por decisão do operador; registrar como fast-follow explícito em `actions.md`/backlog para autenticação básica |
| Endpoint novo de relatório (D-03/D-04) não tem precedente de contrato na base — risco de design errado exigir retrabalho | médio | médio | Cobrir com testes de contrato (unidade + integração) no `/reversa-coding`; manter os nomes de campo de `data-dictionary.md#report_data` para reduzir superfície de decisão nova |
| Consolidar os 3 formatos sob serializador único (BR-MIGRAR-016) pode divergir sutilmente do `report_data` legado se algum campo for esquecido | médio | baixo | Usar a tabela de campos de `_reversa_sdd/data-dictionary.md#report_data` como checklist de paridade em `data-delta.md` |
| Polling de status (D-02) sem backoff pode gerar carga desnecessária no App DB em jobs longos | baixo | baixo | Intervalo fixo razoável (2-3s) definido no `/reversa-coding`; sem SLA de tempo real que justifique complexidade adicional |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] Wizard cobre RF-01 a RF-10 do `requirements.md`, incluindo tela de relatório (RF-10)
- [ ] Novo endpoint `/jobs/:id/report` coberto por testes de unidade e integração (`vitest`)
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Teste manual do `onboarding.md` executado com sucesso contra um MySQL 5.x/8.x de teste

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-plan` | reversa |
