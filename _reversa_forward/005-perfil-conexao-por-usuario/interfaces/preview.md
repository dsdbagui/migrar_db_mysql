# Interface: Preview de rotinas/tabelas (alterada)

> Identificador: `005-perfil-conexao-por-usuario`
> Tipo: HTTP
> Arquivos existentes alterados: `src/features/routines/routes.ts`, `src/features/tables/routes.ts`

Ambas as rotas já existiam. Mudança: ganham `sourceDatabase` obrigatório no corpo (D-06 do `roadmap.md`) — hoje o banco vinha de `resolveForConnection(sourceProfileId)`, que lia `database_name` do perfil; essa coluna deixa de existir (RN-03).

## `POST /routines/preview`

```diff
 {
   "sourceProfileId": "string",
+  "sourceDatabase": "string",
   "select": "all" | string[],
   "newDefiner"?: "string"
 }
```

| Status | Quando |
|--------|--------|
| `200` | `{ "items": [...] }` — mesmo formato de hoje |
| `401` | sem sessão válida (RN-01) |
| `404`/erro de conexão | `sourceProfileId` não existe ou é de outro usuário (mesma regra de `GET /connection-profiles/:id`), ou `sourceDatabase` não existe no MySQL de origem — erro de conexão do driver, propagado como já acontece hoje para bancos inexistentes |

## `POST /tables/preview`

```diff
 {
   "sourceProfileId": "string",
+  "sourceDatabase": "string",
   "select": "all" | string[],
   "forceInnodb"?: boolean
 }
```

Mesma tabela de status de `POST /routines/preview`.

## Nota de idempotência/timeout

Sem mudança em relação ao contrato hoje — preview é uma chamada síncrona de leitura (`information_schema` + `SHOW CREATE`), sujeita ao mesmo timeout de conexão de `connectionManager.ts` (30s, feature `002-timeout-conexao-job`), não introduzida nem alterada por esta feature.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
