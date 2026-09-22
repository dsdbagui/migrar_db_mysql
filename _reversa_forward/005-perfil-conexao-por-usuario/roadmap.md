# Roadmap: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`
> Requirements: `_reversa_forward/005-perfil-conexao-por-usuario/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Dois eixos independentes, mas que compartilham o mesmo App DB. **Auth**: sessão de aplicação armazenada em tabela nova (`app_sessions`, App DB) em vez de JWT/Redis — mesmo raciocínio de AD-01/AD-03 (`target_architecture.md`) de não introduzir infraestrutura nova quando o App DB já resolve; senha com hash via `node:crypto.scrypt` (já o padrão do projeto em `credentialVault.ts`, zero dependência nova) em vez de bcrypt/argon2 externos. **Desacoplamento perfil/banco**: já é uma mudança mais simples do que parece — todo o pipeline de extração/aplicação (`extract.ts`, `apply.ts`, `fkRecovery.ts` de `routines`/`tables`) já recebe `database: string` como parâmetro explícito em cada chamada, nunca hardcoded; hoje esse valor só nasce de `ConnectionParams.database`, vindo de `resolveForConnection(profileId)`. Basta esse ponto único passar a aceitar o banco por chamada. A descoberta importante desta etapa: como `POST /{routines,tables}/preview` já abre conexão e consulta `information_schema` **antes** de qualquer job existir, o campo de banco de origem precisa entrar já na Etapa 1 do wizard (não numa etapa nova isolada antes do disparo) — mais cedo do que RF-09 descreve em termos gerais, mas dentro do mesmo espírito ("antes de disparar o job").

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto — nenhum princípio formal a verificar. n/a.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Sessão de aplicação persistida em tabela nova `app_sessions` (App DB), token opaco em cookie `httpOnly`/`Secure`/`SameSite=Lax`, checada por consulta ao App DB a cada requisição, expiração fixa de 2h (`requirements.md` RNF Segurança) | Consistente com AD-03 (`target_architecture.md`) — App DB já é o único lugar de estado da aplicação; evita introduzir Redis/JWT só para isto, mesma lógica de "stack deliberadamente mínima" (`docs/seguranca-e-stack.md`) | JWT assinado sem estado no servidor — descartado porque não permite invalidar sessão no logout sem lista de revogação (reintroduz o mesmo problema); Redis para sessão — descartado, nenhuma outra parte do sistema usa Redis (AD-01) | 🟢 |
| D-02 | Adicionar `@fastify/cookie` como única dependência nova de backend, para parsing/assinatura do cookie de sessão | Mesmo publisher/padrão de `@fastify/cors`, já em uso; evita reimplementar parsing de `Cookie`/`Set-Cookie` à mão | Implementar parsing de cookie manualmente — descartado, superfície de erro desnecessária para algo que uma dependência de 1 pacote, do mesmo mantenedor já confiado no projeto, resolve | 🟢 |
| D-03 | Hash de senha de usuário via `node:crypto.scrypt` (N=131072/2¹⁷, r=8, p=1, salt aleatório ≥16 bytes, chave derivada de 64 bytes) — parâmetros de fallback recomendados pelo OWASP Password Storage Cheat Sheet quando Argon2id não está disponível[^1] | Zero dependência nova (`node:crypto` já é o padrão do projeto em `credentialVault.ts` para o cofre de credenciais MySQL); scrypt é memory-hard, adequado para senha (diferente de um hash rápido tipo SHA-256)[^1][^2] | Adicionar `bcrypt`/`argon2` como dependência externa — descartado por exigir binário nativo (argon2) ou dependência adicional (bcrypt) quando o runtime já oferece uma opção adequada; hash reversível (mesmo padrão AES-GCM do cofre de credenciais MySQL) — descartado, RF-02 exige irreversibilidade, papel diferente do cofre de credenciais | 🟢 |
| D-04 | `resolveForConnection(profileId, database?)` ganha um segundo parâmetro opcional — quando informado, sobrepõe `database_name` (que deixa de existir na tabela); `connect`/`connectWithAutoCreateDatabase`/`ensureConnected` não mudam de assinatura, continuam recebendo `ConnectionParams` já resolvido | Ponto único de mudança — todo o resto do pipeline (`extract.ts`, `apply.ts`, `fkRecovery.ts`, `copyData.ts`) já trata `database` como parâmetro explícito (confirmado lendo `src/features/tables/*.ts`, `src/features/routines/*.ts`), nenhuma outra função precisa mudar de forma | Fazer cada `service.ts` (`routines`, `tables`) resolver a conexão sem `database` e depois `USE` manualmente — descartado, já é exatamente o que `apply.ts`/`applyRoutine`/`applyTable` fazem via `USE \`${database}\``; a mudança real é só de onde `database` vem |
| D-05 | Campo de banco de origem/destino entra na **Etapa 1** do wizard (`step1.ts`), junto da seleção de perfil, não numa etapa nova — porque a Etapa 2 (`step2.ts`) já chama `previewRoutines`/`previewTables` com `sourceParams.database` antes de qualquer confirmação de job existir | Etapa 2 quebraria (chamada a `information_schema` sem schema definido) se o banco só fosse perguntado depois; mover para a Etapa 1 resolve sem inventar uma etapa nova no wizard (RF-09 pede "antes de disparar o job" — Etapa 1 continua sendo antes disso) | Etapa nova entre step1 e step2 — descartado, adicionaria uma tela só para 1-2 campos de texto que cabem confortavelmente no formulário já existente da Etapa 1 | 🟢 |
| D-06 | `POST /{routines,tables}/preview` e `POST /{routines,tables}/jobs` ganham `sourceDatabase`/`targetDatabase` no corpo (preview só precisa de `sourceDatabase`, já que só conecta na origem) | Efeito direto de D-05: se o dado entra na Etapa 1, tanto o preview (Etapa 2) quanto a criação do job (Etapa 4) precisam recebê-lo | Manter banco só no payload do job e reconectar o preview de outro jeito — descartado, não haveria como a Etapa 2 descobrir os nomes disponíveis sem um schema |
| D-07 | `migration_jobs` ganha colunas próprias `source_database VARCHAR(120) NULL` / `target_database VARCHAR(120) NOT NULL` (mesmo padrão de nullability de `source_profile_id`/`target_profile_id`), não dentro de `params_json` | `runJob` (`jobRunner.ts:206-208`) precisa do banco **antes** de invocar o `FeatureRunner`, para montar `ConnectionParams` via `resolveForConnection` — mesma razão pela qual `source_profile_id`/`target_profile_id` já são colunas de primeira classe, não `params_json` | Guardar dentro de `params_json` e cada `service.ts` extrair de lá — descartado, `runJob` já resolve a conexão antes de chamar o runner, não tem acesso a `params_json` tipado naquele ponto | 🟢 |
| D-08 | Middleware de autenticação registrado globalmente em `app.ts` via `onRequest` hook do Fastify, com allowlist explícita de rotas públicas (`/login`, `/health`) | Um único ponto de enforcement (RF-05) em vez de decorar rota por rota — reduz risco de esquecer uma rota nova no futuro | Decorator por rota (`preHandler` individual em cada `routes.ts`) — descartado, mais fácil de esquecer numa rota nova; `fastify-auth`/plugin de terceiros — descartado, a lógica é simples o suficiente (checar cookie → consultar `app_sessions`) para não justificar dependência nova | 🟢 |
| D-09 | Bootstrap do primeiro usuário via script CLI `src/core/db/createUser.ts`, mesmo padrão de `src/core/db/migrate.ts` (`tsx --env-file=.env`), script novo `npm run create-user -- <username> <senha>`; reaproveitado internamente por `POST /users` (mesma função de hashing) | RF-13 exige que criar usuário exija sessão — mas o primeiro usuário não tem sessão de ninguém para autenticar; um script de linha de comando, rodado direto na VM, resolve sem abrir uma exceção na regra de API (mesmo raciocínio operacional de `CREDENTIAL_VAULT_KEY`, hoje configurada só na VM) | Endpoint de "criar primeiro usuário se a tabela estiver vazia" — descartado, é uma janela de corrida/ataque (quem acessar a rota primeiro vira o único usuário) sem necessidade, já que a VM já é acessível via SSH para rodar um script | 🟢 |

## 4. Premissas

Nenhuma — todas as `[DÚVIDA]` do `requirements.md` foram resolvidas em `/reversa-clarify` (ver `requirements.md#9-esclarecimentos`).

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| Core — Autenticação (novo) | `_reversa_sdd/migration/target_architecture.md` — sem equivalente na tabela de componentes (nenhuma linha cobre auth) | componente-novo | Novo módulo `core/auth.ts` (ou equivalente): hashing de senha (D-03), emissão/validação de sessão (D-01), middleware global (D-08) |
| API / Wizard | `_reversa_sdd/migration/target_architecture.md:46` | contrato-alterado | Toda rota exceto `/login`/`/health` passa a exigir sessão válida (RN-01); Etapa 1 do wizard ganha campos de banco de origem/destino (D-05) |
| Core — Cofre de Credenciais | `_reversa_sdd/migration/target_architecture.md:48` | regra-alterada | `createProfile`/`resolveForConnection` (`credentialVault.ts`) passam a exigir `user_id` na criação e a aceitar `database` como parâmetro de chamada em vez de coluna (D-04); escopo de leitura restrito ao dono (RN-02) |
| Core — Connection Manager | `_reversa_sdd/migration/target_architecture.md:47` | não alterado (consumidor) | Continua recebendo `ConnectionParams` já resolvido — não precisa mudar, só quem o chama muda (D-04) |
| Core — Job Runner | `_reversa_sdd/migration/target_architecture.md:49` | regra-alterada | `createJob`/`runJob` passam a receber/persistir `sourceDatabase`/`targetDatabase` (D-07) e `createdBy` deixa de vir do corpo da requisição, passa a vir da sessão (RN-04) |
| App DB | `_reversa_sdd/migration/target_architecture.md:56` | delta-de-dados | Duas tabelas novas (`app_users`, `app_sessions`); `connection_profiles` perde `database_name`, ganha `user_id`; `migration_jobs` ganha `source_database`/`target_database` — detalhe completo em `data-delta.md` |

## 6. Delta no modelo de dados

- Resumo: 2 tabelas novas (`app_users`, `app_sessions`); `connection_profiles` perde 1 coluna e ganha 1 (com FK); `migration_jobs` ganha 2 colunas. Os `connection_profiles` já existentes na VM `hermes` são apagados pela própria migration (decidido em `/reversa-clarify`).
- Detalhe completo em: `_reversa_forward/005-perfil-conexao-por-usuario/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `POST /login`, `POST /logout`, `POST /users` | HTTP | `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/autenticacao.md` |
| `POST /connection-profiles`, `GET /connection-profiles`, `GET/DELETE /connection-profiles/:id` | HTTP | `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/connection-profiles.md` |
| `POST /routines/preview`, `POST /tables/preview` | HTTP | `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/preview.md` |
| `POST /routines/jobs`, `POST /tables/jobs` | HTTP | `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/criacao-de-job.md` |
| Todas as rotas protegidas (efeito transversal do middleware, D-08) | HTTP | Coberto em `interfaces/autenticacao.md` § Middleware, não repetido arquivo por arquivo |

## 8. Plano de migração

1. `src/core/db/migrations/004_add_app_auth.sql` — cria `app_users` e `app_sessions`
2. `src/core/db/migrations/005_connection_profiles_owner.sql` — `DELETE FROM connection_profiles` (perfis pré-existentes sem dono, decisão do operador), `DROP COLUMN database_name`, `ADD COLUMN user_id` + FK `NOT NULL`
3. `src/core/db/migrations/006_migration_jobs_database_columns.sql` — `ADD COLUMN source_database VARCHAR(120) NULL`, `ADD COLUMN target_database VARCHAR(120) NOT NULL DEFAULT ''` (default temporário só para satisfazer linhas antigas; coluna nova não tem uso retroativo, jobs antigos já concluídos não precisam de backfill real — mesmo raciocínio do `error_message`/`created_at` das features `002`/`004`)
4. Rodar `npm run migrate` em desenvolvimento/homologação
5. Rodar `npm run create-user -- <username> <senha>` (script novo, D-09) para criar o primeiro usuário — pré-requisito para qualquer login funcionar
6. Comunicar à Área de Infraestrutura (dona de `docs/deploy-hermes.md`) que os `connection_profiles` da VM `hermes` serão apagados no próximo deploy — cada operador precisa recadastrar os que usa, agora autenticado

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Cookie de sessão não é enviado entre o frontend (Vite, porta 5173 em dev) e o backend (Fastify, porta 3000) por serem origens diferentes | alto | médio | `@fastify/cors` precisa de `credentials: true` (hoje não tem) e o `fetch` em `web/src/api.ts` precisa de `credentials: "include"` em toda chamada — mudança pequena mas fácil de esquecer; incluir como ação explícita no `actions.md` |
| Perda de acesso total se o primeiro usuário (D-09) não for criado antes do deploy, ou a `CREDENTIAL_VAULT_KEY`/procedimento de bootstrap ficar só na cabeça de quem migrou | alto | baixo | Passo 5 do Plano de migração documentado em `onboarding.md`; mesmo padrão operacional já usado para `CREDENTIAL_VAULT_KEY` (`docs/deploy-hermes.md`) |
| Apagar `connection_profiles` existentes (passo 2) interrompe qualquer job em andamento que dependa deles, e a FK `ON DELETE RESTRICT` de `migration_jobs` pode até impedir o `DELETE` se algum job antigo referenciar um perfil | médio | médio | Rodar a migration só em janela sem jobs `pending`/`running`; se o `DELETE` falhar por FK, é sinal de job histórico referenciando o perfil — decisão do operador era apagar perfis, não jobs, então a migration precisa lidar com isso explicitamente (ver nota em `data-delta.md`) |
| Histórico de jobs (`GET /jobs`, feature `004`) não passa a exibir `source_database`/`target_database` — fica menos rastreável qual banco cada job tocou, mesmo esses dados agora existindo em `migration_jobs` | baixo | alto (é garantido, não passou a existir) | Fora do escopo desta feature (`requirements.md` não pediu); registrar como dívida técnica para iteração futura de `004-historico-de-jobs` ou nova feature |
| `scrypt` (D-03) com N=2¹⁷ tem custo de CPU/memória perceptível por requisição de login — pode ser notado sob carga (mesmo que o volume de uso seja baixo, "uso interno") | baixo | baixo | Parâmetros são o mínimo recomendado pelo OWASP para o fallback scrypt, não o máximo; ajustável depois sem migração de schema (só reprocessar hashes no próximo login, se necessário) |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |

---

[^1]: [Password Storage - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id como recomendação primária; scrypt como fallback memory-hard com custo mínimo 2¹⁷/r=8/p=1.
[^2]: Pesquisa complementar sobre parâmetros de `crypto.scrypt` no Node.js (salt ≥16 bytes, chave derivada de 32-64 bytes, guardar algoritmo+parâmetros+salt junto do hash) — ver `investigation.md`.
