# Interface: Autenticação (login, logout, usuários)

> Identificador: `005-perfil-conexao-por-usuario`
> Tipo: HTTP (Fastify, `src/app.ts`)
> Arquivos novos previstos: `src/core/authRoutes.ts`, `src/core/auth.ts`

## `POST /login`

Rota pública (allowlist do middleware, D-08).

**Request body**

```json
{ "username": "string", "password": "string" }
```

**Responses**

| Status | Corpo | Quando |
|--------|-------|--------|
| `200` | `{}` + `Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax; Max-Age=7200` | credenciais corretas — cria linha em `app_sessions`, `expires_at = NOW() + 2h` |
| `401` | `{ "error": "credenciais inválidas" }` | usuário não existe OU senha errada — **mesma mensagem nos dois casos** (RF-03, mitiga enumeração de conta) |
| `400` | `{ "error": "..." }` | corpo malformado (campos ausentes) |

**Idempotência**: não idempotente por natureza (cada chamada de sucesso cria uma sessão nova); chamar duas vezes com credenciais corretas cria duas sessões válidas simultâneas (múltiplas abas/dispositivos, sem limite nesta entrega).

**Timeout**: sujeito ao custo de `scrypt` (D-03 do `roadmap.md`) — computação síncrona de CPU, não há chamada de rede além do próprio App DB.

## `POST /logout`

Rota protegida (requer sessão válida).

**Request**: sem corpo — o token vem do cookie da própria requisição.

**Responses**

| Status | Corpo | Quando |
|--------|-------|--------|
| `204` | (vazio) | sessão encontrada e removida de `app_sessions`; resposta também limpa o cookie (`Set-Cookie: session=; Max-Age=0`) |
| `401` | `{ "error": "não autenticado" }` | sem cookie de sessão válido — mesmo comportamento do middleware para qualquer outra rota protegida |

**Idempotência**: chamar logout duas vezes seguidas é seguro — a segunda chamada já não tem sessão válida (cookie limpo na primeira resposta), recebe `401`, não erro de servidor.

## `POST /users`

Rota protegida — **RF-13**: só acessível a partir de uma sessão já autenticada (não é cadastro público).

**Request body**

```json
{ "username": "string", "password": "string" }
```

**Responses**

| Status | Corpo | Quando |
|--------|-------|--------|
| `201` | `{ "id": "uuid", "username": "string" }` | usuário criado — nunca retorna `password_hash` |
| `401` | `{ "error": "não autenticado" }` | sem sessão válida |
| `409` | `{ "error": "username já cadastrado" }` | `username` já existe (`UNIQUE KEY uq_app_users_username`) |
| `400` | `{ "error": "..." }` | senha vazia/campos ausentes |

**Nota de bootstrap**: o **primeiro** usuário da instalação não passa por esta rota (ela exige sessão, e o primeiro usuário não tem sessão de ninguém para autenticar) — é criado pelo script `npm run create-user` (D-09 do `roadmap.md`, ver `onboarding.md`), que reaproveita a mesma função de hashing desta rota.

## Middleware de autenticação (efeito transversal, D-08)

Aplicado via `onRequest` hook global em `src/app.ts`, a **todas** as rotas exceto `/login` e `/health`.

- Lê o cookie `session`; se ausente, `401` imediato, sem tocar handler da rota.
- Se presente, consulta `app_sessions WHERE id = ?`; se não encontrado ou `expires_at < NOW()`, `401` (sessão expirada é tratada igual a sessão inexistente — sem mensagem diferenciada, mesmo racional de RF-03).
- Se válida, injeta a identidade do usuário no `request` (ex. `request.userId`, `request.username`) para uso por `RF-06` (dono do perfil), `RF-12` (`created_by` automático).
- Não renova `expires_at` a cada requisição nesta entrega (sem "sliding expiration") — expira exatamente 2h após o login, mesmo com uso contínuo. Não pedido em `requirements.md`; se virar problema de UX na prática, é ajuste de escopo pequeno numa iteração futura.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
