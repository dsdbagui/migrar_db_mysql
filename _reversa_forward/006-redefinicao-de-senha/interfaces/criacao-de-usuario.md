# Interface: Criação de usuário (alterada)

> Identificador: `006-redefinicao-de-senha`
> Tipo: HTTP
> Contrato original: `_reversa_forward/005-perfil-conexao-por-usuario/interfaces/autenticacao.md#POST /users`

## `POST /users`

Única mudança: a política mínima de senha (RN-05, RF-10).

| Status | Antes (`005`) | Depois (`006`) |
|--------|---------------|----------------|
| `400` | `password` vazio ou ausente | `password` ausente **ou com menos de 8 caracteres** (contando caracteres, não bytes), com a mesma mensagem de `passwordPolicy.ts` usada por `create-user` e `POST /users/me/password` |
| demais (`201`, `401`, `409`) | — | sem mudança |

## `POST /login`: explicitamente sem mudança

A política **não** se aplica ao login. Um usuário com senha de menos de 8 caracteres, gravada antes desta feature, continua entrando normalmente (RN-05: não revalida senhas existentes).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
