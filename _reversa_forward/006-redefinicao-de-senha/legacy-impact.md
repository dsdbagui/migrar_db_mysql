# Legacy Impact: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`
> Data da execução: `2026-09-23`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`, `src/core/**`, `tests/core/**`, `src/features/jobs/**`, `tests/features/jobs/**`, `src/features/routines/**`, `src/features/tables/**`, `package.json`, `tests/features/tables/**`, `tests/features/routines/**`, `package-lock.json`, `docs/seguranca-e-stack.md`. Todos os caminhos tocados por esta feature já estavam liberados. `docs/deploy-hermes.md`, que cita o uso antigo do `create-user`, está fora da lista e não foi editado.

## Arquivos afetados

| Arquivo afetado | Componente | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `src/core/passwordPolicy.ts` (novo) | Core — Autenticação (`_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md`) | regra-nova | MEDIUM | Mínimo de 8 caracteres contados por code point, ponto único para toda gravação de senha. Não é aplicado no login |
| `src/core/appUsers.ts` | Core — Autenticação | regra-alterada | HIGH | `createAppUser` passa a aplicar a política. `findUserById` e `changePassword` são novos. `changePassword` é a primeira transação explícita do App DB: `UPDATE app_users` e `DELETE FROM app_sessions WHERE user_id = ?` com commit ou rollback juntos |
| `src/core/authRoutes.ts` | API / Wizard (`_reversa_sdd/migration/target_architecture.md#Componentes`) | delta-de-contrato-externo | HIGH | Rota nova `POST /users/me/password`: só a própria senha, senha atual obrigatória, `403` para senha atual errada, `204` com cookie limpo. `POST /users` passa a responder `400` para senha com menos de 8 caracteres |
| `src/core/db/createUser.ts` | Core — bootstrap operacional (`005`, D-09) | delta-de-contrato-externo | HIGH | **Quebra de uso**: `create-user -- <user> <senha>` passa a sair com código 2. A senha vem do terminal (sem eco, com confirmação) ou da primeira linha de stdin. Flag nova `--reset <user>`. O arquivo virou só o ponto de entrada |
| `src/core/db/createUserCli.ts` (novo) | Core — bootstrap operacional | componente-novo | MEDIUM | Lógica testável do comando: interpretação dos argumentos, fluxo terminal/stdin, códigos de saída 0/1/2/130 e logs sem senha |
| `src/core/db/promptPassword.ts` (novo) | Core — bootstrap operacional | componente-novo | MEDIUM | Leitura em raw mode (Enter, Backspace, Ctrl+C, colagem, demais controles ignorados) e leitura da primeira linha de stdin. Sem dependência nova |
| `web/src/screens/changePassword.ts` (novo), `web/src/main.ts`, `web/index.html` | Cliente web | componente-novo | LOW | Tela "Alterar senha" (`#/account/password`) e link no menu. Mensagens via `textContent` |
| `web/src/api.ts`, `web/src/lib/errorMessages.ts` | Cliente web | delta-de-contrato-externo (espelho local) | LOW | `api.changePassword`. Contextos de mensagem `password-change` (403/400) e `user-create` |
| `docs/seguranca-e-stack.md` | Documentação de segurança | regra-alterada | LOW | Uso novo do `create-user`, política de 8 caracteres (abaixo da recomendação OWASP sem MFA), troca da própria senha, rate limiting também pendente em `/users/me/password` |
| `tests/core/{passwordPolicy,appUsers,promptPassword,createUserCli}.test.ts` (novos), `tests/core/authRoutes.test.ts` | Testes | n/a | n/a | 48 testes novos. O teste de username duplicado da `005` trocou a senha `"outra"` por `"outra-senha"`, para não esbarrar na política |

## Diff conceitual por componente

**Core — Autenticação.** Até a `005`, `app_users.password_hash` só era escrito uma vez, no cadastro, e não havia como trocá-lo sem editar o banco à mão. Agora existe um único caminho de troca, `changePassword`, compartilhado pela CLI e pela API, que também é o único lugar onde sessões são apagadas em massa. A política de senha fica num módulo próprio, fora de `passwordHash.ts`, porque é regra de negócio e não criptografia. Ela vale em toda gravação e **nunca** no login, para não trancar do lado de fora quem já tem senha curta.

**Core — bootstrap operacional.** O script de criação de usuário mudou de contrato. A senha deixou de passar pelo shell, que era a causa raiz do incidente de 2026-09-23 (senha gravada truncada, `investigation.md` § 1). O script também deixou de ignorar argumentos a mais. A premissa de que o `npm run` repassa o terminal ao script foi confirmada sob pseudo-terminal. A redefinição de terceiros ficou deliberadamente **só** aqui (RN-04): exige acesso à VM, não uma sessão da aplicação.

**API / Wizard.** Rota nova sob o middleware global da `005`, sem nenhuma exceção na allowlist. O `me` na URL torna estruturalmente impossível apontar outro usuário. O código `403` para senha atual errada foi escolhido por causa do comportamento da `005` no frontend: `web/src/api.ts` manda ao login em qualquer `401`.

**Cliente web.** Uma tela e um link novos. Nenhuma tela existente mudou de comportamento.

## Preservadas

- **W001 da `005`** (toda rota exceto `/login`/`/health` exige sessão): a rota nova não entrou na allowlist, e o teste de `401` sem sessão cobre isso.
- **W003 da `005`** (perfil estritamente privado): intacto. Nenhuma rota nova toca `connection_profiles`, e o `--reset` preserva o `id` do usuário e, portanto, os perfis dele (RF-05, validado contra MySQL real).
- **W004 da `005` / BR-MIGRAR-015** (senha nunca em claro): nenhuma resposta nem log contém senha ou hash. Há teste da CLI e grep nos logs do servidor real com resultado 0.
- **Hash scrypt (D-03 da `005`)**: mesmo algoritmo e mesmos parâmetros. A troca reutiliza `hashPassword`, sem caminho paralelo.
- **`POST /login`**: sem mudança. A política não se aplica ao login, e há teste com senha curta pré-existente.
- **Regras do domínio de migração** (`_reversa_sdd/domain.md`): nenhum arquivo de migração de rotinas ou tabelas foi tocado.

## Modificadas

- **Uso do `create-user`** (`_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md`, "o primeiro usuário é criado por `npm run create-user`"; `docs/deploy-hermes.md`): a senha deixou de ser argumento. O comando passa a ser `create-user -- <username>`, com a senha digitada ou vinda de stdin, e ganha `--reset`.
- **"Reset de senha fora do escopo"** (`_reversa_forward/005-perfil-conexao-por-usuario/requirements.md` § 6): deixou de valer. Agora há troca da própria senha pela API/tela e redefinição de terceiros pela CLI.
- **Senha "não vazia"** (`005`, `readCredentials` em `authRoutes.ts`): passou a "8 ou mais caracteres" na criação e na troca. O login continua aceitando qualquer senha não vazia.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-coding` | reversa |
