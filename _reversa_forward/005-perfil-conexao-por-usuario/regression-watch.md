# Regression Watch: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|-------------------------------|----------------------|---------------------|
| W001 | `_reversa_sdd/permissions.md` § 🟢 "não há login, sessão, papéis" (versão web); `legacy-impact.md § Modificadas` | A versão web **tem** autenticação: toda rota exige sessão válida, exceto `POST /login` e `GET /health`, aplicada por um único hook global (`src/core/authMiddleware.ts`), não rota a rota | redação + presença | Uma re-extração da versão web volta a descrever a aplicação como "sem login / só perímetro de rede", ou encontra uma rota nova registrada fora do alcance do hook global (ex.: plugin encapsulado registrado antes do middleware) |
| W002 | `_reversa_sdd/migration/target_domain_model.md` (`AGG-ConnectionProfile`); `target_data_model.md:43`; `legacy-impact.md § Modificadas` | `connection_profiles` **não** tem `database_name`; tem `user_id NOT NULL` (FK para `app_users`) e rótulo único por dono `(user_id, label)` | ausência + presença | `database_name` reaparece em `connection_profiles` ou em qualquer consulta (ex.: `serializer.ts`, que já foi um consumidor oculto dessa coluna), ou o `UNIQUE` volta a ser só `label` |
| W003 | `_reversa_sdd/migration/target_business_rules.md` (BR-HUMANA-002); `legacy-impact.md § Diff conceitual` (Cofre de Credenciais) | Perfil de conexão é estritamente privado: listar, ler, excluir e usar em preview ou job filtram pelo usuário da sessão, e perfil de outro dono responde `404` (não `403`) | presença | Uma rota nova ou refatorada aceita `sourceProfileId`/`targetProfileId` sem checar o dono (ex.: chamando `resolveForConnection` direto, que não filtra), ou devolve `403` e revela que o perfil existe |
| W004 | `_reversa_sdd/migration/target_business_rules.md` (BR-MIGRAR-015) | Senhas nunca saem em claro: nem a do MySQL (cofre AES-256-GCM), nem a da aplicação (`app_users.password_hash` é scrypt, irreversível, e nunca é devolvido por `POST /users`); logs de login e cadastro não contêm senha | presença | Qualquer resposta HTTP ou linha de log com `password`, `password_enc` ou `password_hash`; hash de senha de aplicação trocado por algo reversível ou por hash rápido (SHA-*) |
| W005 | `_reversa_sdd/permissions.md` § 🟢 (`questions.md#pergunta-9`); `legacy-impact.md § Modificadas` | `migration_jobs.created_by` é sempre a identidade da sessão (`request.username`); o campo `createdBy` enviado pelo cliente é ignorado | presença | Rota de criação de job volta a ler `createdBy` do corpo, ou reaparece o default `"unknown"` para jobs novos |
| W006 | `_reversa_sdd/migration/target_business_rules.md` (BR-MIGRAR-014) | O banco de destino sugere o mesmo nome do banco de origem, agora como espelhamento na Etapa 1 do wizard, até o operador editar o destino | redação | Etapa 1 com o destino sempre vazio (regra perdida) ou sempre sobrescrito pela origem, mesmo depois de editado |
| W007 | `legacy-impact.md § Arquivos afetados` (migration `005`) | `005_connection_profiles_owner.sql` é idempotente: o `DELETE FROM connection_profiles` e o `ALTER` só rodam enquanto `database_name` existir, e jobs antigos são desassociados (`profile_id = NULL`), nunca apagados | presença | Uma edição da migration remove a guarda `@needs_owner_migration` (cada `npm run migrate` passaria a apagar todos os perfis), ou troca a desassociação por `DELETE` de jobs |

## Observações

<!-- Itens sem peso de regressão: comportamento novo ainda não confirmado por uma extração reversa completa, ou decisão 🟡. -->

- **RF-01 a RF-13** (`requirements.md`): implementados e cobertos por 63 testes novos (`tests/core/{passwordHash,sessionStore,authRoutes,authMiddleware,profileRoutes,credentialVault}.test.ts`, `tests/features/{tables,routines}/routes.test.ts`), por um teste HTTP de ponta a ponta contra MySQL 8 real e por um fluxo no Chromium (login → perfil → wizard → sair). Ainda não confirmados por uma extração `/reversa` completa sobre o código Node/web. Ganham peso quando uma re-extração os capturar.
- **Sessão de 2h sem renovação** e **cookie `SameSite=Lax`/`HttpOnly`/`Secure`** (D-01): decisão confirmada em `/reversa-clarify`, mas é comportamento novo, sem regra 🟢 de origem. `SESSION_COOKIE_SECURE=false` é um escape só para testes por HTTP fora de `localhost`.
- **Tempo de resposta igual para usuário inexistente e senha errada** (`getDummyHash`): mitigação de enumeração por tempo acrescentada nesta execução, além do que RF-03 exigia (que era só a mesma mensagem). Requisito 🟡 no `requirements.md` (RNF Segurança).
- **Desassociar jobs antigos em vez de apagá-los** (migration `005`): o plano deixou isso como "decisão operacional". A implementação escolheu desassociar. Vale revisar com o operador antes do deploy na VM `hermes`.
- **Ordem de registro `cors` → `cookie` → middleware em `app.ts`**: detalhe de implementação coberto por teste (`401` com cabeçalhos CORS, preflight não bloqueado), não uma regra de negócio.
- **Ausência de rate limiting em `POST /login`**: limitação conhecida, registrada em `docs/seguranca-e-stack.md`. Não é regressão.
- **`GET /jobs` não exibe `source_database`/`target_database`**: dívida conhecida do `roadmap.md § Riscos`, fora do escopo desta feature.

## Histórico de re-extrações

_(vazio — preenchido pelo agente reverso na próxima execução de `/reversa` sobre este código)_

## Arquivadas

_(vazio)_
