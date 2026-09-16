# Actions: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Roadmap: `_reversa_forward/001-frontend-wizard-migracao-web/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 21 |
| Paralelizáveis (`[//]`) | 6 |
| Maior cadeia de dependência | 10 (T001 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T018) |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Inicializar o scaffold mínimo do projeto frontend (`web/`) — build/dev server, sem fixar biblioteca de UI ainda (decisão de stack concreta fica para a execução desta ação) | - | `[//]` | `web/` | 🟡 | `[X]` |
| T002 | Criar o esqueleto do diretório `src/features/reports/` no backend com `routes.ts` exportando `registerReportsRoutes` vazio (ainda não registrado em `app.ts`) | - | `[//]` | `src/features/reports/routes.ts` | 🟡 | `[X]` |
| T003 | Criar arquivo de configuração do frontend apontando para a base URL do backend Fastify (variável de ambiente de build) | T001 | - | `web/.env.example` | 🟡 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T004 | Escrever testes de contrato (vitest) para `POST /jobs/:id/report` e `GET /jobs/:id/report`, cobrindo os casos `400`/`404`/`409` descritos em `interfaces/relatorio-de-job.md`, antes de implementar o serializador | T002 | `[//]` | `tests/features/reports/report.routes.test.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | Implementar função que deriva `type` de rotina e `engine`/`mode` de tabela a partir de `migration_jobs.params_json` (opção "b" de `data-delta.md`, sem nova migração de schema) | T002 | - | `src/features/reports/deriveMetadata.ts` | 🟡 | `[X]` |
| T006 | Implementar o serializador único que monta as 4 variantes (`json`/`html`/`sql`/`retry`) a partir de `migration_jobs` + `job_items` + `job_item_fk_specs`, reutilizando `deriveMetadata` | T005 | - | `src/features/reports/serializer.ts` | 🟡 | `[X]` |
| T007 | Implementar `POST /jobs/:id/report` — valida que `migration_jobs.status` é terminal (`409` se não for), gera o relatório via serializador e faz upsert em `job_reports` | T006, T004 | - | `src/features/reports/routes.ts` | 🟡 | `[X]` |
| T008 | Implementar `GET /jobs/:id/report?format=json\|html\|sql\|retry` — `400` para formato inválido, `404` para job/relatório/retry inexistente | T007 | - | `src/features/reports/routes.ts` | 🟡 | `[X]` |
| T009 | Implementar tela de gerenciamento de perfis de conexão (listar/criar/excluir) consumindo `/connection-profiles*`, com campo de senha sempre write-only (RF-01, RF-09) | T001 | - | `web/src/screens/ConnectionProfiles.*` | 🟢 | `[X]` |
| T010 | Implementar Etapa 1 do wizard: seleção da feature (`routines`/`tables`) e dos perfis de conexão origem/destino (RF-02) | T009 | - | `web/src/screens/wizard/Step1.*` | 🟢 | `[X]` |
| T011 | Implementar Etapa 2 do wizard: seleção multi-select de itens por nome exato, com opção "selecionar todos" (RF-03, RN-01) | T010 | - | `web/src/screens/wizard/Step2.*` | 🟡 | `[X]` |
| T012 | Implementar Etapa 3 do wizard: formulário de opções específicas por feature (rotinas: `newDefiner`/`dropExisting`; tabelas: `copyData`/`skipCreate`/`forceInnodb`/`filters`/`columnDefaults`/`restoreRemovedFks`) (RF-04) | T011 | - | `web/src/screens/wizard/Step3.*` | 🟢 | `[X]` |
| T013 | Implementar Etapa 4 do wizard: chamar `POST /{feature}/preview`, exibir `Issue`s por item, invalidar o preview ao alterar qualquer opção das etapas anteriores (RF-05, RN-02) | T012 | - | `web/src/screens/wizard/Step4Preview.*` | 🟢 | `[X]` |
| T014 | Implementar disparo do job (`POST /{feature}/jobs`), captura do `jobId` (HTTP 202) e navegação para a tela de acompanhamento (RF-06) | T013 | - | `web/src/screens/wizard/ConfirmSubmit.*` | 🟢 | `[X]` |
| T015 | Implementar tela de acompanhamento: polling periódico de `GET /{feature}/jobs/:id` até status terminal, com retentativa automática em falha de rede (RF-07, NFR Resiliência) | T014 | - | `web/src/screens/JobStatus.*` | 🟢 | `[X]` |
| T016 | Implementar tela de resultado final: itens processados (`applied`/`skipped`/`issues`/`rowsCopied`) mais o fluxo de geração/download do relatório via `POST`/`GET /jobs/:id/report` (RF-08, RF-10) | T015, T008 | - | `web/src/screens/JobResult.*` | 🟡 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T017 | Registrar `registerReportsRoutes(app)` em `src/app.ts`, ao lado de `registerRoutinesRoutes`/`registerTablesRoutes`/`registerProfileRoutes` | T008 | - | `src/app.ts` | 🟢 | `[X]` |
| T018 | Conectar a navegação entre as etapas do wizard preservando o preenchimento ao voltar para uma etapa anterior, dentro da mesma sessão de navegador (NFR Usabilidade) | T016 | - | `web/src/wizard/state.*` | 🟡 | `[X]` |
| T019 | Tratar, na tela de perfis, o erro retornado ao excluir um perfil referenciado por um job existente (`FOREIGN KEY ... ON DELETE RESTRICT`) sem quebrar a tela (RF-01, critério de aceite) | T009 | `[//]` | `web/src/screens/ConnectionProfiles.*` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T020 | Adicionar mensagens de erro amigáveis em pt-br para os casos `400`/`404`/`409` do endpoint de relatório e para falhas de conexão MySQL propagadas pelos endpoints existentes | T016 | `[//]` | `web/src/lib/errorMessages.*` | 🟡 | `[X]` |
| T021 | Escrever `README.md` curto do frontend com os passos de `onboarding.md` desta feature (setup local, variáveis de ambiente) | T001 | `[//]` | `web/README.md` | 🟢 | `[X]` |

## Notas de execução

<!--
Reservado para /reversa-coding registrar avisos ou observações que surgiram durante a execução.
Não use isso para corrigir ações, edits manuais ficam fora desse arquivo, vão direto no código.
-->

- **T005**: a derivação de `type` de rotina não é possível a partir de `migration_jobs.params_json` como o `data-delta.md` original previa (esse campo não guarda PROCEDURE/FUNCTION por item) — implementado via regex sobre `job_items.ddl_fixed`/`ddl_original`, que já é persistido por item. `engine`/`mode` de tabela continuam vindo de `params_json` como planejado.
- **T011**: o backend não expõe uma rota dedicada para listar nomes de itens disponíveis na origem antes da seleção. A Etapa 2 do wizard chama `POST /{feature}/preview` com `select: "all"` só para descobrir os nomes existentes (efeito colateral zero, é um `SELECT`) — o preview "oficial" com a seleção final roda de novo na Etapa 4 (RF-05). Documentado também em `web/src/screens/wizard/step2.ts`.
- **T009/RF-09**: o backend não tem endpoint de atualização de perfil (`PATCH`/`PUT /connection-profiles/:id` não existe, só `POST`/`GET`/`DELETE`). Não há, portanto, tela de edição de perfil nesta entrega — RF-09 é satisfeito por não haver formulário que pudesse reexibir a senha, mas o cenário "reabrir um perfil para edição" do `onboarding.md` (passo 6) não se aplica como descrito. Fica registrado como gap para uma entrega futura se a edição de perfil for necessária.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-to-do` | reversa |
