# Regression Watch: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|-------------------------------|----------------------|---------------------|
| W001 | `legacy-impact.md § Modificadas` (uso do `create-user`); `interfaces/cli-create-user.md` | O `create-user` **nunca** aceita a senha como argumento: senha em `argv` ou argumento excedente termina com código 2 sem gravar nada. A senha vem do terminal sem eco ou da primeira linha de stdin | ausência + presença | O script volta a ler `process.argv` para a senha, ou volta a ignorar argumentos excedentes em silêncio (o defeito de 2026-09-23) |
| W002 | `legacy-impact.md § Diff conceitual` (Core — Autenticação); `data-delta.md` § 4 | Toda troca de senha (CLI `--reset` e `POST /users/me/password`) passa por `changePassword`, que atualiza o hash e apaga **todas** as sessões do usuário na mesma transação | presença | Um caminho novo grava `password_hash` sem apagar as sessões, ou apaga fora da transação (senha nova com sessões antigas vivas) |
| W003 | `requirements.md` RN-04; `interfaces/troca-de-senha.md` | Pela API só se troca a **própria** senha: o usuário vem da sessão, a senha atual é obrigatória e senha atual errada responde `403` (não `401`). Redefinir a de terceiros é só pela CLI | presença | Surge rota ou parâmetro que aceita outro usuário (`/users/:id/password`, `userId` no corpo), a senha atual deixa de ser exigida, ou o erro vira `401` (o frontend mandaria ao login e a mensagem se perderia) |
| W004 | `legacy-impact.md § Modificadas` (senha "não vazia" → 8); `requirements.md` RN-05 | A política de 8 caracteres (por code point) vale em **toda gravação** (create-user, `--reset`, `POST /users`, `POST /users/me/password`) e **nunca** no login | presença + ausência | Um dos quatro caminhos grava senha sem passar por `validateNewPassword`, ou a política passa a ser aplicada no `POST /login` e tranca senhas antigas curtas |
| W005 | `legacy-impact.md § Preservadas` (W004 da `005`) | Nenhuma resposta HTTP nem log da CLI ou da API contém a senha ou o hash. Os logs de troca registram `username`, `canal` e `sessoesEncerradas` | presença | Qualquer log ou resposta com `password`, `newPassword`, `currentPassword` ou `password_hash` |

## Observações

<!-- Sem peso de regressão: comportamento novo ainda não confirmado por extração reversa, ou decisão 🟡. -->

- **RF-01 a RF-11** (`requirements.md`): implementados e cobertos por 48 testes novos, por validação sob pseudo-terminal real (T013) e por um fluxo no Chromium com dois navegadores. Ganham peso formal quando uma re-extração `/reversa` os capturar.
- **Mínimo de 8 caracteres abaixo da recomendação OWASP sem MFA (15)**: decisão consciente do operador (`investigation.md` § 4). Não é regressão. Revisitar se a aplicação sair da VPN ou ganhar MFA.
- **Colagem com Enter no meio**, no terminal: o que vem depois do Enter é descartado. Comportamento de borda, testado, sem peso de regressão.
- **Sem rate limiting em `POST /users/me/password`**: mesma limitação já registrada para `/login` em `docs/seguranca-e-stack.md`.
- **`docs/deploy-hermes.md` desatualizado**: ainda cita `create-user -- <usuario> <senha>`. Está fora do `allowedPaths` e é pendência de documentação, não de código.

## Histórico de re-extrações

_(vazio — preenchido pelo agente reverso na próxima execução de `/reversa` sobre este código)_

## Arquivadas

_(vazio)_
