# Legacy Impact: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data da execução: `2026-09-23`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`, `src/core/**`, `tests/core/**`, `src/features/jobs/**`, `tests/features/jobs/**`, `src/features/routines/**`, `src/features/tables/**`, `package.json`, `tests/features/tables/**`, `tests/features/routines/**`, `docs/seguranca-e-stack.md`. Os quatro últimos globs foram acrescentados pelo usuário nesta sessão, a pedido do `/reversa-coding`. `package-lock.json` foi liberado depois, e só então a T004 foi concluída (`@fastify/cookie@^11.1.2` declarado em `package.json` + `package-lock.json`, `npm ci` consistente).

## Arquivos afetados

| Arquivo afetado | Componente | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `src/core/db/migrations/004_add_app_auth.sql` (novo) | App DB (`_reversa_sdd/migration/target_architecture.md:56`) | delta-de-dados | LOW | Tabelas novas `app_users` e `app_sessions`, `CREATE TABLE IF NOT EXISTS`, aditivas |
| `src/core/db/migrations/005_connection_profiles_owner.sql` (novo) | App DB — `connection_profiles` | delta-de-dados | **CRITICAL** | **Apaga todos os perfis de conexão existentes** (decisão do operador em `/reversa-clarify`), remove `database_name`, adiciona `user_id NOT NULL` + FK, troca o `UNIQUE(label)` global por `UNIQUE(user_id, label)` e **desassocia** (`profile_id = NULL`) os jobs antigos que referenciavam esses perfis. Tudo é condicionado à existência de `database_name`, porque `migrate.ts` reaplica todas as migrations a cada execução. Validado contra MySQL 8 real em schema descartável: primeira execução migra, a segunda não apaga nada |
| `src/core/db/migrations/006_migration_jobs_database_columns.sql` (novo) | App DB — `migration_jobs` | delta-de-dados | LOW | `source_database NULL` / `target_database NOT NULL DEFAULT ''`, com o mesmo idioma idempotente de `002`/`003` |
| `src/core/passwordHash.ts` (novo) | Core — Autenticação (componente novo, sem linha em `target_architecture.md`) | componente-novo | MEDIUM | scrypt N=2¹⁷/r=8/p=1, salt 16 B, chave 64 B, parâmetros gravados junto do hash (83 bytes). Segurança de senha depende inteiramente deste arquivo |
| `src/core/sessionStore.ts` (novo) | Core — Autenticação | componente-novo | MEDIUM | Sessão opaca de 32 bytes em `app_sessions`, `expires_at = NOW() + INTERVAL 2 HOUR`, validação sempre pelo relógio do App DB |
| `src/core/appUsers.ts` (novo, fora do `actions.md`) | Core — Autenticação | componente-novo | LOW | `findUserByUsername`/`createAppUser` compartilhados entre `POST /users` e o script de bootstrap, para os dois gravarem o mesmo formato de hash |
| `src/core/authMiddleware.ts` (novo) | API / Wizard (`target_architecture.md:46`) | regra-nova | **HIGH** | Hook `onRequest` global: toda rota exige sessão, exceto `/login` e `/health`. Registrado como plugin sem encapsulamento, depois de `@fastify/cors` e `@fastify/cookie`, para o 401 sair com cabeçalhos CORS. Preflight `OPTIONS` passa direto |
| `src/core/authRoutes.ts` (novo) | API — contratos novos | delta-de-contrato-externo | MEDIUM | `POST /login` (mesma resposta e mesmo custo de tempo para usuário inexistente e senha errada), `POST /logout`, `POST /users` (fechado). Logs de login/cadastro sem senha (T034) |
| `src/core/db/createUser.ts` (novo) + `package.json` (script `create-user`) | Core — bootstrap operacional | componente-novo | LOW | `npm run create-user -- <username> <senha>` para o primeiro usuário da instalação (D-09) |
| `src/app.ts` | API — composição | regra-alterada | HIGH | Registra `@fastify/cookie`, o middleware e as rotas de auth; CORS com `credentials: true`. `@fastify/cookie@^11.1.2` declarado como dependência nova (T004, D-02) |
| `src/core/credentialVault.ts` | Core — Cofre de Credenciais (`target_architecture.md:48`) | regra-alterada | HIGH | `createProfile` exige `userId`; `listProfiles`/`getProfile`/`deleteProfile` filtram pelo dono; `resolveForConnection(id, database?)` recebe o banco por chamada (D-04). Cifragem AES-256-GCM e `CREDENTIAL_VAULT_KEY` intactos |
| `src/core/profileRoutes.ts` | API — perfis de conexão | delta-de-contrato-externo | HIGH | Escopo privado (RN-02): perfil de outro dono responde 404; `databaseName` sai do corpo e da resposta; rótulo duplicado do mesmo dono passa a responder 409 (antes estourava 500) |
| `src/core/jobRunner.ts` | Core — Job Runner (`target_architecture.md:49`) | regra-alterada | MEDIUM | `createJob` grava `source_database`/`target_database`; `runJob` passa-os a `resolveForConnection` (`target_database = ''` de jobs antigos vira "sem banco") |
| `src/features/routines/routes.ts`, `src/features/tables/routes.ts` | API — preview e criação de job | delta-de-contrato-externo | HIGH | `sourceDatabase` obrigatório no preview; `sourceDatabase`/`targetDatabase` obrigatórios no job (400 se vazios); perfis precisam ser do usuário da sessão (404); `createdBy` vem de `request.username`, e o campo do corpo é ignorado |
| `src/features/reports/serializer.ts` (fora do `actions.md`) | Relatórios (`target_architecture.md` — serializador único, BR-MIGRAR-016) | regra-alterada | HIGH | Lia `connection_profiles.database_name` via `LEFT JOIN`, coluna removida pela `005`: **a geração de relatório quebraria em produção**. Passa a ler `migration_jobs.source_database`/`target_database`. Não previsto no `roadmap.md` |
| `web/src/api.ts` | Cliente web | delta-de-contrato-externo (espelho local) | MEDIUM | `credentials: "include"` em toda chamada; 401 redireciona para `#/login` (exceto a própria chamada de login); `login`/`logout`/`createUser`; preview/job recebem os bancos |
| `web/src/screens/login.ts` (novo), `web/src/main.ts`, `web/index.html`, `web/src/lib/errorMessages.ts` | Cliente web | componente-novo | LOW | Tela de login, rota `/login`, link "Sair" (chama `/logout` e limpa o wizard), mensagens de login e de 409 de perfil |
| `web/src/screens/connectionProfiles.ts` | Cliente web — perfis | regra-alterada | LOW | Sem campo nem coluna "Banco" (RF-07) |
| `web/src/state/wizardState.ts`, `web/src/screens/wizard/step1.ts` | Cliente web — wizard | regra-alterada | MEDIUM | Etapa 1 pede banco de origem e de destino (D-05); o destino espelha a origem até ser editado (BR-MIGRAR-014); o fingerprint do preview passa a incluir perfil e banco de origem |
| `web/src/screens/wizard/step2.ts`, `step4Preview.ts` (fora do `actions.md`), `confirmSubmit.ts` | Cliente web — wizard | regra-alterada | MEDIUM | Preview (etapas 2 e 4) e disparo usam os bancos do estado; `createdBy` não é mais enviado. A `step4Preview.ts` também chamava o preview e não constava do plano |
| `docs/seguranca-e-stack.md` | Documentação de segurança | regra-alterada | LOW | Controle de acesso reescrito: login próprio, sessão, perfis privados, CSRF via `SameSite=Lax`, ausência de rate limiting |
| `tests/core/*.test.ts` (6 arquivos novos), `tests/features/{tables,routines}/routes.test.ts` (novos) | Testes | n/a | n/a | 63 testes novos de contrato, sessão, hash, escopo privado, middleware e CORS no 401 |
| `tests/features/jobs/routes.test.ts`, `tests/features/reports/report.routes.test.ts` | Testes pré-existentes | n/a | n/a | Passam a enviar o cookie de sessão (middleware global); o teste de relatório passa a verificar que o banco vem do job e falha se a query mencionar `database_name` |

## Diff conceitual por componente

**API / Wizard (autenticação).** Antes, a API inteira era aberta a quem tivesse rota de rede até a porta do backend (`docs/seguranca-e-stack.md`, postura anterior). Agora existe um único ponto de controle, um hook `onRequest` global com allowlist explícita (`/login`, `/health`), então uma rota nova nasce protegida. A ordem de registro importa e ficou documentada em `app.ts`: `cors` → `cookie` → middleware. Sem isso, o 401 sairia sem `Access-Control-Allow-Origin` e o frontend, em outra origem, veria "erro de rede" em vez de "não autenticado", e o redirecionamento para o login não aconteceria. Há teste cobrindo esse caso.

**Core — Cofre de Credenciais.** O perfil deixou de ser um "atalho para um banco" e virou uma credencial de servidor pertencente a um usuário. O banco passou a ser um parâmetro de cada job ou preview, e `resolveForConnection` é o único ponto em que ele entra. O restante do pipeline (`extract.ts`, `apply.ts`, `fkRecovery.ts`, `copyData.ts`, `connectionManager.ts`) não mudou, como o `roadmap.md` previa. O filtro por dono fica nas funções expostas à API. `resolveForConnection` segue sem filtro porque roda em background dentro de `runJob`, sem sessão. A posse é verificada pelas rotas antes de o job existir.

**Core — Job Runner.** `createJob` ganhou duas colunas de primeira classe e `createdBy` passou a ser a identidade da sessão. `runJob` só mudou na montagem de `ConnectionParams`.

**App DB.** Duas tabelas novas e mudanças destrutivas em `connection_profiles`. O plano deixava em aberto o que fazer com jobs antigos que referenciassem perfis apagados (FK `ON DELETE RESTRICT`). A implementação escolheu **desassociar** esses jobs (`profile_id = NULL`, colunas já anuláveis) em vez de apagá-los. O histórico sobrevive e aparece em `GET /jobs` sem rótulo de perfil (o `LEFT JOIN` da feature 004 já cobre isso). A unicidade do rótulo passou a ser por dono: com perfis privados, um `UNIQUE(label)` global faria o usuário B receber erro, e ainda descobrir que o perfil existe, ao reutilizar um rótulo do usuário A.

**Relatórios.** Correção obrigatória não prevista no plano: `serializer.ts` era um consumidor oculto de `connection_profiles.database_name`. Sem a correção, `POST /jobs/:id/report` falharia com erro de SQL logo após a migration `005`. O relatório agora mostra o banco que o job realmente usou, e não mais o banco "padrão" do perfil. Para jobs, é uma informação mais correta.

**Cliente web.** O fluxo muda para o operador: tela de login, link "Sair", a Etapa 1 pede os bancos e o formulário de perfil perde o campo de banco. Todo 401 leva ao login, inclusive quando a sessão expira depois de 2h no meio do wizard. O estado do wizard fica em memória e sobrevive ao redirecionamento enquanto a página não recarrega.

## Preservadas

Regras 🟢 que continuam intactas:

- **BR-MIGRAR-015** (senha MySQL nunca em claro): o cofre segue AES-256-GCM com a mesma chave. Nenhuma rota nova expõe `password_enc`, e o `POST /users` nunca devolve o hash da senha de aplicação. Os logs novos de login/cadastro não incluem senha.
- **BR-HUMANA-002** (cofre de credenciais com perfis reutilizáveis): mantido e **reforçado**. O perfil agora é reutilizável entre bancos diferentes, que era o objetivo da feature.
- **BR-MIGRAR-014** (destino sugere o mesmo banco da origem): preservada na nova forma. Antes vivia no perfil; agora é o espelhamento origem→destino na Etapa 1. A porta padrão `3306` do perfil continua.
- **Regras do domínio de migração** (`_reversa_sdd/domain.md`: `TINYINT(1)` preservado, restauração de FK depois da carga, `column_defaults`, severidade fixa das transformações): nenhum arquivo de transformação, extração, aplicação ou cópia foi tocado.
- **Cancelamento cooperativo e guarda `AND status = 'running'`** (features 002/003): intactos em `runJob`.
- **`GET /jobs` com `LEFT JOIN`** (W002 da feature 004): intacto. Passa a ser também o que mantém visíveis os jobs desassociados pela migration `005`.
- **`DELETE /connection-profiles/:id` → 409 quando referenciado por job**: preservado.

## Modificadas

- **`permissions.md` 🟢 "Não há login, sessão, papéis de usuário nem controle de acesso"**: vale para o legado CLI e continua verdadeira sobre `migrate_routines.py`. Para a versão web, **deixou de valer**: agora há login, sessão de 2h e escopo privado de perfis. A postura "perímetro de rede como único controle de acesso" (`docs/seguranca-e-stack.md`, feature 001) foi revertida.
- **`permissions.md` 🟢 (`questions.md#pergunta-9`) "registro de quem rodou a migração não é relevante"**: a web agora grava a identidade real em `migration_jobs.created_by`. A regra do CLI não é contrariada (o `report.json` continua sem autoria), mas a versão web passou a registrar autoria, o que não existia antes.
- **Modelo `AGG-ConnectionProfile`** (`_reversa_sdd/migration/target_domain_model.md`, `target_data_model.md:43`): `database_name` removido e `user_id` adicionado. O `target_data_model.md` fica desatualizado até o `/reversa-sync`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-coding` | reversa |
