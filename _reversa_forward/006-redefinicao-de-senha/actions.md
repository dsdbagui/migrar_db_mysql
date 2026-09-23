# Actions: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Roadmap: `_reversa_forward/006-redefinicao-de-senha/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 19 |
| Paralelizáveis (`[//]`) | 11 |
| Maior cadeia de dependência | 6 (T001 → T006 → T007 → T009 → T010 → T013) |

## Fase 1, Preparação

Nenhuma ação. A feature não tem migration (`data-delta.md` § 2) nem dependência nova (D-01).

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Testes de `validateNewPassword`: 7 caracteres recusa, 8 aceita, contagem por code point (`"ação1234"` aceita, emoji conta 1), vazio recusa, mensagem única (RF-10, D-05) | - | `[//]` | `tests/core/passwordPolicy.test.ts` | 🟢 | `[X]` |
| T002 | Testes de `appUsers`: `findUserById`; `changePassword` faz `UPDATE` do hash e `DELETE` das sessões do usuário na mesma transação (`beginTransaction`/`commit`); `rollback` quando o `DELETE` falha; recusa senha fora da política sem tocar o banco; `createAppUser` também aplica a política (D-04, D-05) | - | `[//]` | `tests/core/appUsers.test.ts` | 🟢 | `[X]` |
| T003 | Testes de `promptPassword` com streams simulados: modo não-TTY usa só a primeira linha, preserva espaços e `$#!&`, remove só o `\n`/`\r\n` final, stdin vazio é erro; modo TTY trata Enter, Backspace, Ctrl+C (abort), colagem de vários caracteres num evento, e sempre desliga o raw mode (D-01, D-02) | - | `[//]` | `tests/core/promptPassword.test.ts` | 🟢 | `[X]` |
| T004 | Testes da lógica da CLI (`runCreateUser(argv, deps)`, sem banco real): `<user>` cria; `--reset <user>` redefine; senha como argumento, argumentos a mais, flag desconhecida e username ausente dão código 2; confirmação diferente, usuário existente (criação) e inexistente (reset) dão código 1 (`interfaces/cli-create-user.md`) | - | `[//]` | `tests/core/createUserCli.test.ts` | 🟢 | `[X]` |
| T005 | Estender testes de contrato de auth: `POST /users/me/password` responde 204 com cookie limpo e sessões apagadas, 403 com senha atual errada (sessão continua válida), 400 com senha nova curta ou corpo inválido, 401 sem sessão; `POST /users` responde 400 com senha de 7 caracteres; `POST /login` aceita senha curta já existente (`interfaces/troca-de-senha.md`, `interfaces/criacao-de-usuario.md`) | - | `[//]` | `tests/core/authRoutes.test.ts` | 🟢 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | Implementar `src/core/passwordPolicy.ts`: `MIN_PASSWORD_LENGTH = 8` e `validateNewPassword(pw): string \| null` por code point (D-05) | T001 | `[//]` | `src/core/passwordPolicy.ts` | 🟢 | `[X]` |
| T007 | Em `appUsers.ts`: `findUserById`, `changePassword(userId, newPassword)` transacional (hash + `DELETE FROM app_sessions WHERE user_id = ?`, retorna nº de sessões encerradas), `PasswordPolicyError`, e política aplicada também em `createAppUser` (D-04, D-05, D-07) | T002, T006 | - | `src/core/appUsers.ts` | 🟢 | `[X]` |
| T008 | Implementar `src/core/db/promptPassword.ts`: `readPasswordFromTty(prompt, io)` em raw mode sem eco e `readPasswordFromStdin(io)` (primeira linha), com erro tipado para abort/stdin vazio (D-01, D-02) | T003 | `[//]` | `src/core/db/promptPassword.ts` | 🟢 | `[X]` |
| T009 | Implementar `src/core/db/createUserCli.ts`: `runCreateUser(argv, deps): Promise<number>`, que faz o parse de `<user>` / `--reset <user>`, escolhe TTY (com confirmação) ou stdin, chama `createAppUser`/`changePassword` e devolve o código de saída 0/1/2/130 (D-03) | T004, T007, T008 | - | `src/core/db/createUserCli.ts` | 🟢 | `[X]` |
| T010 | Reduzir `src/core/db/createUser.ts` a ponto de entrada: chama `runCreateUser(process.argv.slice(2), deps reais)`, define `process.exitCode` e fecha o pool do App DB | T009 | - | `src/core/db/createUser.ts` | 🟢 | `[X]` |
| T011 | Em `authRoutes.ts`: rota `POST /users/me/password` (usuário da sessão, `verifyPassword` da atual → 403, política → 400, `changePassword`, `clearCookie`, 204) (D-06, D-07) | T005, T007 | - | `src/core/authRoutes.ts` | 🟢 | `[X]` |
| T012 | Em `authRoutes.ts`: `POST /users` devolve 400 com a mensagem da política quando `createAppUser` lançar `PasswordPolicyError`; `POST /login` continua sem aplicar política | T011 | - | `src/core/authRoutes.ts` | 🟢 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T013 | Validar a premissa do roadmap § 4 contra um App DB descartável: `npm run create-user` sob pseudo-terminal (`script -q -c`) pede a senha sem eco e cria o usuário; o caminho stdin (`printf ... \|`) grava a senha exata; `--reset` encerra sessões reais. Se o npm não repassar o TTY, registrar em `onboarding.md` a forma `npx tsx` | T010 | - | `_reversa_forward/006-redefinicao-de-senha/onboarding.md` | 🟡 | `[X]` |
| T014 | Em `web/src/api.ts`: `changePassword({ currentPassword, newPassword })` chamando `POST /users/me/password` | T011 | `[//]` | `web/src/api.ts` | 🟢 | `[X]` |
| T015 | Em `web/src/lib/errorMessages.ts`: contexto `password-change` (403 → "Senha atual incorreta.", 400 → mensagem da política) e mensagem de 400 da política em `POST /users` | T012 | `[//]` | `web/src/lib/errorMessages.ts` | 🟢 | `[X]` |
| T016 | Criar `web/src/screens/changePassword.ts`: senha atual, nova e confirmação; checa confirmação e mínimo de 8 no cliente; avisa que todas as sessões serão encerradas; com sucesso faz `resetWizard()` e vai a `#/login` (D-08, RF-11) | T014, T015 | - | `web/src/screens/changePassword.ts` | 🟢 | `[X]` |
| T017 | Registrar a rota `#/account/password` em `web/src/main.ts` e o link "Alterar senha" na `<nav>` de `web/index.html` | T016 | - | `web/src/main.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T018 | Logs de redefinição sem senha nem hash: `logger.ok("Senha redefinida", { username, canal, sessoesEncerradas })` na CLI (`canal: "cli"`) e na API (`canal: "api"`); `logger.warn` para senha atual incorreta (D-09) | T010, T012 | `[//]` | `src/core/db/createUserCli.ts` | 🟢 | `[X]` |
| T019 | Atualizar `docs/seguranca-e-stack.md`: novo uso do `create-user` (terminal/stdin, `--reset`), política de 8 caracteres (abaixo da recomendação OWASP sem MFA, decisão registrada), troca da própria senha pela API/tela encerrando sessões | T012 | `[//]` | `docs/seguranca-e-stack.md` | 🟢 | `[X]` |

## Notas de execução

Execução de 2026-09-23 (`/reversa-coding`). 19 de 19 ações concluídas.

- **Premissa do roadmap § 4 confirmada (T013)**: `npm run create-user` repassa o terminal ao script. Validado sob um pseudo-terminal real (sem eco, confirmação, Ctrl+C com código 130), por stdin, e com o `--reset` encerrando 2 sessões reais. Login posterior com a senha exata `` p@ss w$rd!#&;`ç ``.
- **Verificação**: 181 testes verdes (48 novos nesta feature), `tsc` sem erros no backend e no web, `vite build` ok. API contra MySQL 8 real em schema descartável (403/400/204, outra sessão passa a 401). Fluxo no Chromium com dois navegadores logados no mesmo usuário.
- **Fora do plano, necessário**: o teste pré-existente de `POST /users` com username duplicado usava a senha `"outra"` (5 caracteres). Com a política ele passaria a receber 400 em vez de 409, então a senha foi trocada por `"outra-senha"` (`tests/core/authRoutes.test.ts`). Contexto `user-create` em `errorMessages.ts`, para quando existir tela de cadastro.
- `docs/deploy-hermes.md` também cita o formato antigo de uso, mas está fora do `allowedPaths` de `.reversa/reversa-config.json`. Nenhuma ação o edita. Ver `roadmap.md` § 9.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-to-do` | reversa |
| 2026-09-23 | Execução por `/reversa-coding`: 19/19 ações | reversa |
