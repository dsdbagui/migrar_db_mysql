# Interface: Perfis de conexão (alterada)

> Identificador: `005-perfil-conexao-por-usuario`
> Tipo: HTTP
> Arquivo existente alterado: `src/core/profileRoutes.ts`, `src/core/credentialVault.ts`

Todas as rotas abaixo já existiam (feature `migracao-de-tabelas`/base); esta entrega altera o contrato, não cria rota nova. Todas passam a exigir sessão válida (RN-01, middleware D-08).

## `POST /connection-profiles`

**Request body — mudança:** remove `databaseName?` (RF-07); `user_id` **não** vem do corpo, é derivado da sessão (não confiar em campo enviado pelo cliente).

```diff
 {
   "label": "string",
   "host": "string",
   "port": number,
   "user": "string",
-  "password": "string",
-  "databaseName"?: "string"
+  "password": "string"
 }
```

**Response — mudança:** remove `databaseName` do corpo de retorno.

| Status | Quando |
|--------|--------|
| `201` | perfil criado, associado a `request.userId` (RF-06) |
| `401` | sem sessão válida |
| `400` | payload inválido |

## `GET /connection-profiles`

**Mudança de comportamento (RN-02, escopo estritamente privado):** retorna somente perfis cujo `user_id` é o do usuário autenticado da sessão — não mais todos os perfis cadastrados.

| Status | Quando |
|--------|--------|
| `200` | lista (pode ser vazia) — só perfis do dono |
| `401` | sem sessão válida |

## `GET /connection-profiles/:id`

**Mudança de comportamento:** se o perfil existe mas pertence a outro usuário, retorna `404` (não `403`) — não revela a um usuário autenticado que um id de perfil de outro dono existe (mesmo racional de não vazar existência de recurso alheio).

| Status | Quando |
|--------|--------|
| `200` | perfil pertence ao usuário da sessão |
| `404` | perfil não existe OU pertence a outro usuário |
| `401` | sem sessão válida |

## `DELETE /connection-profiles/:id`

Mesma regra de escopo de `GET /connection-profiles/:id` (`404` se o perfil é de outro usuário, não `403`); comportamento de `409` para perfil referenciado por job (`ON DELETE RESTRICT`, `001_init.sql:31-32`) é preservado sem alteração.

| Status | Quando |
|--------|--------|
| `204` | excluído |
| `404` | não existe ou é de outro usuário |
| `409` | referenciado por `migration_jobs` existente |
| `401` | sem sessão válida |

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
