# Interface: Troca da própria senha (nova)

> Identificador: `006-redefinicao-de-senha`
> Tipo: HTTP (Fastify, `src/core/authRoutes.ts`)

## `POST /users/me/password`

Rota protegida (middleware global da `005`, D-08): exige sessão válida. Só troca a senha **do usuário da sessão** (`request.userId`, RN-04). Não existe parâmetro para indicar outro usuário.

**Request body**

```json
{ "currentPassword": "string", "newPassword": "string" }
```

**Responses**

| Status | Corpo | Quando |
|--------|-------|--------|
| `204` | (vazio) + `Set-Cookie: session=; Max-Age=0` | senha atual confere e a nova atende a política. O hash é trocado e **todas** as sessões do usuário, inclusive a desta requisição, são apagadas na mesma transação (RF-08, RF-09) |
| `400` | `{ "error": "..." }` | `currentPassword`/`newPassword` ausentes ou não string, ou `newPassword` com menos de 8 caracteres (mensagem única de `passwordPolicy.ts`, RF-10) |
| `401` | `{ "error": "não autenticado" }` | sem sessão válida (middleware, sem mudança) |
| `403` | `{ "error": "senha atual incorreta" }` | `currentPassword` não confere. Nada é alterado e a sessão continua válida. **Não** é `401`, porque o frontend (`web/src/api.ts`) redireciona todo `401` ao login (D-06) |

**Ordem de validação:** corpo malformado (`400`), depois política da senha nova (`400`), depois senha atual (`403`). A política vem antes para não gastar o scrypt da senha atual à toa.

**Idempotência:** não idempotente. Uma segunda chamada com o mesmo cookie recebe `401`, porque a primeira apagou a sessão.

**Timeout:** custo de dois scrypt no pior caso (verificar a atual e gerar o hash da nova), cerca de 1s. Nenhuma chamada externa além do App DB.

**Logs:** sucesso vira `logger.ok("Senha redefinida", { username, canal: "api", sessoesEncerradas })`, e senha atual errada vira `logger.warn(...)` com o `username`. Nunca a senha nem o hash.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
