# Actions: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`
> Roadmap: `_reversa_forward/005-perfil-conexao-por-usuario/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 34 |
| Paralelizáveis (`[//]`) | 24 |
| Maior cadeia de dependência | 9 (T001 → T006 → T014 → T015 → T017 → T024 → T025 → T026 → T027) |

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Criar `src/core/db/migrations/004_add_app_auth.sql` (`CREATE TABLE app_users`, `CREATE TABLE app_sessions`, `data-delta.md` § 3) | - | `[//]` | `src/core/db/migrations/004_add_app_auth.sql` | 🟢 | `[X]` |
| T002 | Criar `src/core/db/migrations/005_connection_profiles_owner.sql` (`DELETE FROM connection_profiles`, `DROP COLUMN database_name`, `ADD COLUMN user_id` + FK) | T001 | - | `src/core/db/migrations/005_connection_profiles_owner.sql` | 🟢 | `[X]` |
| T003 | Criar `src/core/db/migrations/006_migration_jobs_database_columns.sql` (`ADD COLUMN source_database`, `ADD COLUMN target_database`) | - | `[//]` | `src/core/db/migrations/006_migration_jobs_database_columns.sql` | 🟢 | `[X]` |
| T004 | Adicionar `@fastify/cookie` às dependências de `package.json` (D-02 do `roadmap.md`) | - | `[//]` | `package.json` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | Escrever testes de hash de senha: mesma senha gera hashes diferentes por salt aleatório; `verify` aceita a senha correta e rejeita a errada (D-03) | - | `[//]` | `tests/core/passwordHash.test.ts` | 🟢 | `[X]` |
| T006 | Escrever testes de `app_sessions`: criar sessão, ler sessão válida, sessão expirada (`expires_at < NOW()`) é tratada como inválida, `deleteSession` remove (D-01) | T001 | `[//]` | `tests/core/sessionStore.test.ts` | 🟢 | `[X]` |
| T007 | Escrever testes de contrato para `POST /login`/`POST /logout`/`POST /users` (`interfaces/autenticacao.md`): login correto cria sessão; login incorreto (senha errada e usuário inexistente) retorna a mesma mensagem genérica; `POST /users` sem sessão retorna `401`; `username` duplicado retorna `409` | T001 | `[//]` | `tests/core/authRoutes.test.ts` | 🟡 | `[X]` |
| T008 | Escrever testes do middleware de autenticação: rota protegida sem cookie retorna `401`; cookie inválido/sessão expirada retorna `401`; `/login` e `/health` continuam acessíveis sem sessão (RF-05, D-08) | T001 | `[//]` | `tests/core/authMiddleware.test.ts` | 🟢 | `[X]` |
| T009 | Escrever testes de escopo privado de `connection_profiles`: `GET /connection-profiles` só retorna perfis do usuário da sessão; `GET`/`DELETE /connection-profiles/:id` de perfil de outro usuário retorna `404` (RN-02, `interfaces/connection-profiles.md`) | T002 | `[//]` | `tests/core/profileRoutes.test.ts` | 🟢 | `[X]` |
| T010 | Estender/criar testes de `resolveForConnection(id, database?)`: banco passado por parâmetro sobrepõe qualquer valor de linha; perfil sem `database` explícito não quebra (D-04) | T002 | `[//]` | `tests/core/credentialVault.test.ts` | 🟢 | `[X]` |
| T011 | Escrever testes de contrato para `POST /tables/preview` e `POST /tables/jobs`: exigem `sourceDatabase`/`targetDatabase`; `createdBy` do job passa a vir da sessão, não do corpo (RN-04, `interfaces/preview.md`, `interfaces/criacao-de-job.md`) | T002, T003 | `[//]` | `tests/features/tables/routes.test.ts` | 🟢 | `[X]` |
| T012 | Escrever testes de contrato equivalentes para `POST /routines/preview` e `POST /routines/jobs` | T002, T003 | `[//]` | `tests/features/routines/routes.test.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T013 | Implementar `src/core/passwordHash.ts`: `hashPassword`/`verifyPassword` via `node:crypto.scrypt` (N=131072, r=8, p=1, salt 16 bytes, chave 64 bytes — D-03) | T005 | `[//]` | `src/core/passwordHash.ts` | 🟢 | `[X]` |
| T014 | Implementar `src/core/sessionStore.ts`: `createSession`/`getSession`/`deleteSession` contra `app_sessions`, `expires_at = NOW() + 2h` (D-01) | T006, T013 | - | `src/core/sessionStore.ts` | 🟢 | `[X]` |
| T015 | Implementar `src/core/authMiddleware.ts`: `onRequest` hook global, allowlist `/login`+`/health`, injeta `request.userId`/`request.username` (D-08) | T008, T014 | - | `src/core/authMiddleware.ts` | 🟢 | `[X]` |
| T016 | Implementar `src/core/authRoutes.ts`: `POST /login`, `POST /logout`, `POST /users` (`interfaces/autenticacao.md`) | T007, T013, T014 | - | `src/core/authRoutes.ts` | 🟢 | `[X]` |
| T017 | Registrar `@fastify/cookie`, `authMiddleware` e `authRoutes` em `src/app.ts` | T004, T015, T016 | - | `src/app.ts` | 🟢 | `[X]` |
| T018 | Criar script de bootstrap `src/core/db/createUser.ts` (reaproveita `passwordHash.ts`) + comando `"create-user"` em `package.json` (D-09) | T013 | `[//]` | `src/core/db/createUser.ts` | 🟢 | `[X]` |
| T019 | Atualizar `src/core/credentialVault.ts`: `createProfile` passa a exigir `userId`; `listProfiles`/`getProfile`/`deleteProfile` filtram por `userId`; `resolveForConnection(id, database?)` aceita banco explícito (D-04, RN-02, RN-03) | T002, T010 | `[//]` | `src/core/credentialVault.ts` | 🟢 | `[X]` |
| T020 | Atualizar `src/core/profileRoutes.ts`: usar `request.userId` nas 4 rotas; remover `databaseName` do corpo/resposta; `404` para perfil de outro dono (`interfaces/connection-profiles.md`) | T015, T019, T009 | - | `src/core/profileRoutes.ts` | 🟢 | `[X]` |
| T021 | Atualizar `src/core/jobRunner.ts`: `createJob` recebe/persiste `sourceDatabase`/`targetDatabase`; `runJob` passa esses valores para `resolveForConnection` (D-07) | T019 | `[//]` | `src/core/jobRunner.ts` | 🟢 | `[X]` |
| T022 | Atualizar `src/features/routines/routes.ts`: `preview`/`jobs` recebem `sourceDatabase`/`targetDatabase`; `createdBy` passa a vir de `request.username` (D-06, RN-04) | T021, T012 | `[//]` | `src/features/routines/routes.ts` | 🟢 | `[X]` |
| T023 | Atualizar `src/features/tables/routes.ts`: mesma mudança de T022, aplicada a `tables` | T021, T011 | `[//]` | `src/features/tables/routes.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T024 | Atualizar CORS em `src/app.ts` para `credentials: true` (necessário para o cookie de sessão cruzar origens em dev — Risco 1 do `roadmap.md`) | T017 | - | `src/app.ts` | 🟢 | `[X]` |
| T025 | Atualizar `web/src/api.ts`: `credentials: "include"` em toda chamada de `request()`; adicionar `login`/`logout`/`createUser` ao client | T024 | - | `web/src/api.ts` | 🟢 | `[X]` |
| T026 | Criar `web/src/screens/login.ts` (tela de login) | T025 | - | `web/src/screens/login.ts` | 🟢 | `[X]` |
| T027 | Registrar rota `/login` em `web/src/main.ts`; `request()` (`api.ts`) redireciona para `/login` em resposta `401`, exceto quando o próprio caminho chamado é `/login` | T026 | - | `web/src/main.ts` | 🟢 | `[X]` |
| T028 | Atualizar `web/src/screens/connectionProfiles.ts`: remover campo "Banco" do formulário e da coluna da tabela (RF-07) | T020 | `[//]` | `web/src/screens/connectionProfiles.ts` | 🟢 | `[X]` |
| T029 | Atualizar `web/src/screens/wizard/step1.ts` e `web/src/state/wizardState.ts`: adicionar campos de banco de origem e de destino, gravados no estado do wizard (D-05, D-06) | T022, T023 | `[//]` | `web/src/screens/wizard/step1.ts` | 🟢 | `[X]` |
| T030 | Atualizar `web/src/screens/wizard/step2.ts`: usar `sourceDatabase` do estado ao chamar `previewRoutines`/`previewTables` | T029 | `[//]` | `web/src/screens/wizard/step2.ts` | 🟢 | `[X]` |
| T031 | Atualizar `web/src/screens/wizard/confirmSubmit.ts`: enviar `sourceDatabase`/`targetDatabase` na criação do job; remover `createdBy` do payload | T029 | `[//]` | `web/src/screens/wizard/confirmSubmit.ts` | 🟢 | `[X]` |
| T032 | Adicionar link "Sair" (logout) à `<nav>` estática de `web/index.html`, chamando `api.logout()` e navegando para `/login` | T026 | `[//]` | `web/index.html` | 🟡 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T033 | Atualizar `docs/seguranca-e-stack.md` § Controle de acesso, revertendo a postura "sem autenticação/login" para refletir esta feature | T017 | `[//]` | `docs/seguranca-e-stack.md` | 🟢 | `[X]` |
| T034 | Logar tentativas de login (sucesso/falha) e criação de usuário via `logger` existente, nunca incluindo a senha (mesmo padrão de `credentialVault.ts`) | T016 | `[//]` | `src/core/authRoutes.ts` | 🟢 | `[X]` |

## Notas de execução

Execução de 2026-09-23 (`/reversa-coding`). 34 de 34 ações concluídas (T004 fechada na mesma data, depois que `package-lock.json` entrou no `allowedPaths`).

- **T004 (fechada depois)**: estava pendente porque `package-lock.json` não está no `allowedPaths` de `.reversa/reversa-config.json`. `@fastify/cookie` foi instalado só em `node_modules` (`npm install --no-save`) para validar a feature, e o lock foi conferido por hash como inalterado. Para fechar: liberar `package-lock.json` e rodar `npm install @fastify/cookie@^11`. Sem isso, `npm ci` num ambiente limpo não instala o pacote e o servidor não sobe (`src/app.ts` o importa). T017/T024 foram marcadas `[X]` porque o código está escrito e testado; só a declaração da dependência falta.
- **Fora do plano, necessário**: `src/features/reports/serializer.ts` lia `connection_profiles.database_name` (removida pela `005`), e a geração de relatório quebraria. Passou a ler `migration_jobs.source_database`/`target_database`. `web/src/screens/wizard/step4Preview.ts` também chamava o preview sem banco. Os testes pré-existentes `tests/features/{jobs,reports}` passaram a enviar sessão.
- **Fora do plano, decisões de implementação**: `src/core/appUsers.ts` (compartilhado por `POST /users` e `create-user`). Rótulo de perfil único por dono (`UNIQUE(user_id, label)`, com 409 no duplicado). A migration `005` desassocia jobs antigos (`profile_id = NULL`) em vez de apagá-los, e é idempotente (`migrate.ts` reaplica tudo a cada execução). BR-MIGRAR-014 (destino espelha a origem na Etapa 1). `SESSION_COOKIE_SECURE=false` como escape para testes por HTTP fora de `localhost`. Mesmo custo de tempo no login para usuário inexistente e senha errada.
- **Verificação**: 133 testes verdes (63 novos), `tsc` sem erros no backend e no web, `vite build` ok. Migrations aplicadas duas vezes contra MySQL 8 real em schema descartável. Teste HTTP de ponta a ponta com o servidor real. Fluxo no Chromium (login → perfil sem banco → wizard com banco na Etapa 1 → Etapa 2 listando o banco informado → Sair), com o cookie `Secure` atravessando origens em `localhost`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-to-do` | reversa |
| 2026-09-23 | Execução por `/reversa-coding`: 33/34 ações, T004 pendente (lockfile fora do `allowedPaths`) | reversa |
| 2026-09-23 | T004 concluída: `@fastify/cookie@^11.1.2` declarado em `package.json` + `package-lock.json` | reversa |
