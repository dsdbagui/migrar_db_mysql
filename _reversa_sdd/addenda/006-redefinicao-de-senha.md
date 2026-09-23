# Adendo: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-23.

## Resumo da entrega

Na `005`, `npm run create-user -- <username> <senha>` recebia a senha como argumento. O shell a interpretava (`$`, `#`, `!`, `&`, espaço…) e o script descartava argumentos excedentes em silêncio, o que já gravou uma senha truncada em uso real. Também não havia como trocar uma senha sem apagar o usuário, o que levaria junto seus perfis de conexão.

A entrega faz três coisas:
- **Script `create-user`:** a senha passa a ser pedida no terminal sem eco (com confirmação) ou lida da primeira linha de stdin, e ganha a opção `--reset <username>`, que redefine a senha de outro usuário e fica restrita à VM.
- **Troca da própria senha:** o usuário troca a sua pela tela "Alterar senha" ou por `POST /users/me/password`, informando a senha atual.
- **Regras transversais:** toda troca encerra todas as sessões do usuário na mesma transação, e toda gravação de senha exige no mínimo 8 caracteres. O login não aplica essa política.

As 19 ações de `actions.md` foram concluídas. São 181 testes automatizados verdes, 48 deles novos, e não há migration de banco.

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md` | `#Impacto por artefato da extração` (Core — Autenticação) | regra-alterada | `appUsers.ts` ganha `changePassword`, primeira transação explícita do App DB: troca o hash e apaga todas as sessões do usuário juntos. Também ganha `findUserById`, e `createAppUser` passa a aplicar a política de senha |
| `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md` | `#Impacto por artefato da extração` (Core — Autenticação) | regra-nova | Módulo novo `passwordPolicy.ts`: mínimo de 8 caracteres por code point em toda gravação de senha, **nunca** no login (senhas curtas anteriores continuam válidas até a próxima troca) |
| `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md` | `#Resumo da entrega` ("o primeiro usuário é criado por `npm run create-user`") | delta-de-contrato-externo | Leia o uso como `npm run create-user -- <username>` (senha digitada sem eco ou por stdin) e `npm run create-user -- --reset <username>`. A forma com a senha como argumento sai com código 2. Contrato em `_reversa_forward/006-redefinicao-de-senha/interfaces/cli-create-user.md` |
| `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md` | `#Impacto por artefato da extração` (Core — Autenticação, bootstrap) | componente-novo | `src/core/db/createUserCli.ts` (lógica e códigos de saída 0/1/2/130) e `src/core/db/promptPassword.ts` (leitura sem eco em raw mode e leitura de stdin). `createUser.ts` fica só como ponto de entrada |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes` (API / Wizard) | delta-de-contrato-externo | Rota nova `POST /users/me/password`: só a própria senha, senha atual obrigatória, `403` para senha atual errada (não `401`, que o frontend trata como sessão expirada), `204` com cookie limpo. `POST /users` passa a responder `400` para senha com menos de 8 caracteres |
| `_reversa_sdd/migration/target_data_model.md` | `#Schema (DDL ou equivalente)` (`app_users`, `app_sessions`) | — (sem mudança de schema) | Nenhuma migration nova. Só comportamento: `app_users.password_hash` passa a ser atualizado, e `app_sessions` passa a ter apagamento em massa por `user_id` |
| Telas do wizard, entregues por `001-frontend-wizard-migracao-web` e `005` | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md § Impacto por artefato` | componente-novo | Tela "Alterar senha" (`#/account/password`) com link no menu. Com sucesso, descarta o wizard em andamento e volta ao login |
| `_reversa_sdd/permissions.md` | `#1. Papel "Operador" (único papel de aplicação)` | regra-alterada | Continua existindo um papel só, mas agora com uma assimetria: pela aplicação cada usuário só troca a **própria** senha. Redefinir a de terceiros exige acesso à VM (`--reset`) |
| `_reversa_sdd/domain.md` | Regras de migração | — (preservado) | Nenhuma regra do domínio de migração foi tocada |

## Regras sob vigilância

- `W001` a `W005`: ver `_reversa_forward/006-redefinicao-de-senha/regression-watch.md`

## Nota de correção

Os artefatos da feature (`roadmap.md` § 8–9, `actions.md` § Notas, `legacy-impact.md`, `regression-watch.md` § Observações) afirmam que `docs/deploy-hermes.md` citaria o formato antigo `create-user -- <usuario> <senha>`. **Isso não procede**: conferido em 2026-09-23, o arquivo não menciona o `create-user`. Não há pendência de documentação causada por esta feature naquele arquivo.

## Fontes

- `_reversa_forward/006-redefinicao-de-senha/requirements.md`
- `_reversa_forward/006-redefinicao-de-senha/roadmap.md`
- `_reversa_forward/006-redefinicao-de-senha/data-delta.md`
- `_reversa_forward/006-redefinicao-de-senha/legacy-impact.md`
- `_reversa_forward/006-redefinicao-de-senha/regression-watch.md`
- `_reversa_forward/006-redefinicao-de-senha/progress.jsonl`
