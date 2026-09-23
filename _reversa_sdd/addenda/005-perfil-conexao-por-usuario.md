# Adendo: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-23`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-23.

## Resumo da entrega

Até esta feature, a versão web não tinha login próprio: o perímetro de rede (VPN) era o único controle de acesso. Além disso, cada `connection_profile` carregava um `database_name` fixo, o que obrigava a cadastrar um perfil por banco mesmo com host, usuário e senha iguais. A entrega faz duas coisas:

- **Autenticação de aplicação:** usuários em `app_users` com senha em hash scrypt, sessão de 2h em `app_sessions` via cookie `HttpOnly`/`Secure`/`SameSite=Lax`, middleware global que exige sessão em toda rota exceto `/login` e `/health`, cadastro fechado (`POST /users` exige sessão, e o primeiro usuário é criado por `npm run create-user`).
- **Desacoplamento entre perfil e banco:** o perfil passa a ter dono e ser estritamente privado. O banco de origem e o de destino são informados a cada migração, na Etapa 1 do wizard, e gravados no próprio job (`migration_jobs.source_database`/`target_database`).

As 34 ações de `actions.md` foram concluídas. São 133 testes automatizados verdes, 63 deles novos.

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (API / Wizard) | regra-nova | A API deixou de ser aberta: um hook `onRequest` global (`src/core/authMiddleware.ts`) exige sessão válida em toda rota, exceto `POST /login` e `GET /health`, e responde `401` antes de qualquer handler |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (sem linha equivalente) | componente-novo | Leia a tabela com um componente a mais, **Core — Autenticação**: `passwordHash.ts` (scrypt N=2¹⁷), `sessionStore.ts` (sessão opaca, 2h, sem renovação), `appUsers.ts`, `authRoutes.ts` e o script `src/core/db/createUser.ts` |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (API / Wizard) | delta-de-contrato-externo | Rotas novas `POST /login`, `POST /logout` e `POST /users`. Preview e criação de job (`/routines/*`, `/tables/*`) passam a exigir `sourceDatabase`/`targetDatabase` e perfis do próprio usuário (`404` para perfil alheio), e `createdBy` deixa de vir do corpo. Contratos em `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/` |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (Core — Cofre de Credenciais) | regra-alterada | O perfil agora pertence a um usuário e é estritamente privado. Não guarda mais banco: `resolveForConnection(id, database?)` recebe o banco de cada job. Cifragem AES-256-GCM e `CREDENTIAL_VAULT_KEY` sem mudança |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (Core — Job Runner) | regra-alterada | `createJob` grava o banco de origem e de destino, e `created_by` é o usuário da sessão. `runJob` resolve cada conexão com o banco do próprio job (`''` de jobs antigos vira "sem banco") |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (features/reports) | regra-alterada | O relatório mostra o banco que o job realmente usou (`migration_jobs.source_database`/`target_database`), não mais o `database_name` do perfil, coluna que deixou de existir |
| `_reversa_sdd/migration/target_data_model.md` | `#Schema (DDL ou equivalente)` | delta-de-dados | Tabelas novas `app_users` e `app_sessions`. Em `connection_profiles`, sai `database_name`, entra `user_id NOT NULL` (FK com `ON DELETE CASCADE`), e o `UNIQUE(label)` passa a `UNIQUE(user_id, label)`. `migration_jobs` ganha `source_database`/`target_database`. Migrations `004`–`006`, detalhe em `_reversa_forward/005-perfil-conexao-por-usuario/data-delta.md` |
| `_reversa_sdd/migration/target_data_model.md` | `#Schema (DDL ou equivalente)` (dados existentes) | delta-de-dados | A migration `005` **apaga todos os perfis de conexão pré-existentes** (decisão do operador) e desassocia os jobs antigos (`profile_id = NULL`) sem apagá-los. É idempotente: só age enquanto `database_name` existir |
| `_reversa_sdd/migration/target_domain_model.md` | `#Aggregates` (`AGG-ConnectionProfile`) | regra-alterada | O aggregate ganha o invariante "tem dono e só o dono o vê ou usa", e perde o banco. O banco passa a ser atributo do job (`AGG-MigrationJob`) |
| `_reversa_sdd/permissions.md` | `#Contexto`, `#1. Papel "Operador" (único papel de aplicação)` | regra-alterada | "Não há login, sessão, papéis" continua valendo para o CLI legado, mas **não para a versão web**: agora há login, sessão de 2h e escopo privado de perfis. Ainda há um único papel, sem RBAC entre usuários |
| `_reversa_sdd/domain.md` | Regras de migração (transformações, FK, `column_defaults`) | — (preservado) | Nenhuma regra 🟢 do domínio de migração foi tocada. Extração, transformação, aplicação e cópia de dados seguem iguais, só a origem do nome do banco mudou |
| `_reversa_sdd/migration/target_business_rules.md` | `#BR-MIGRAR-014` | regra-alterada | "Destino sugere o mesmo banco da origem" vive agora na Etapa 1 do wizard: o banco de destino espelha o de origem até o operador editá-lo |
| Telas do wizard, entregues por `001-frontend-wizard-migracao-web` | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md § Impacto por artefato` | componente-novo | Tela nova de login (`#/login`) e link "Sair". Todo `401` redireciona ao login. O formulário de perfil perde o campo "Banco", e a Etapa 1 ganha banco de origem e de destino |

## Regras sob vigilância

- `W001` a `W007`: ver `_reversa_forward/005-perfil-conexao-por-usuario/regression-watch.md`

## Fontes

- `_reversa_forward/005-perfil-conexao-por-usuario/requirements.md`
- `_reversa_forward/005-perfil-conexao-por-usuario/roadmap.md`
- `_reversa_forward/005-perfil-conexao-por-usuario/data-delta.md`
- `_reversa_forward/005-perfil-conexao-por-usuario/legacy-impact.md`
- `_reversa_forward/005-perfil-conexao-por-usuario/regression-watch.md`
- `_reversa_forward/005-perfil-conexao-por-usuario/progress.jsonl`
