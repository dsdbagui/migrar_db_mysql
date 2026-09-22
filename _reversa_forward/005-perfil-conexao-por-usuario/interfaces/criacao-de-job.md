# Interface: Criação de job (rotinas/tabelas) — alterada

> Identificador: `005-perfil-conexao-por-usuario`
> Tipo: HTTP
> Arquivos existentes alterados: `src/features/routines/routes.ts`, `src/features/tables/routes.ts`, `src/core/jobRunner.ts`

## `POST /routines/jobs`

```diff
 {
   "sourceProfileId": "string",
   "targetProfileId": "string",
+  "sourceDatabase": "string",
+  "targetDatabase": "string",
   "select": "all" | string[],
   "newDefiner"?: "string",
-  "dropExisting"?: boolean,
-  "createdBy"?: "string"
+  "dropExisting"?: boolean
 }
```

`createdBy` sai do corpo da requisição (RN-04, RF-12) — `jobRunner.createJob` passa a receber a identidade a partir de `request.username` (injetada pelo middleware, `interfaces/autenticacao.md`), não do payload enviado pelo cliente.

## `POST /tables/jobs`

Mesmo diff de `sourceDatabase`/`targetDatabase` adicionados e `createdBy` removido, aplicado a `TablesJobParams`; nenhum outro campo de `TablesJobParams` (`copyData`, `skipCreate`, `forceInnodb`, `filters`, `columnDefaults`, `restoreRemovedFks`, `createDatabaseIfMissing`) muda.

## Resposta (ambas as rotas) — sem alteração

| Status | Quando |
|--------|--------|
| `202` | `{ "id": "uuid" }` — job criado, roda em background (sem mudança de comportamento) |
| `401` | sem sessão válida |
| `404`/erro | `sourceProfileId`/`targetProfileId` não existe ou é de outro usuário |

## Efeito em `migration_jobs` (persistência)

`createJob` (`jobRunner.ts`) grava `source_database`/`target_database` como colunas próprias (D-07 do `roadmap.md`, `data-delta.md`), não dentro de `params_json`. `runJob` usa esses valores para montar `ConnectionParams.database` ao chamar `resolveForConnection(profileId, database)` (D-04) antes de invocar o `FeatureRunner` — sem isso a conexão não saberia contra qual schema operar.

## Idempotência

Sem mudança — cada chamada cria um job novo (`randomUUID()`), mesmo com `sourceProfileId`/`targetProfileId` repetidos; agora também é possível repetir o mesmo par de perfis com `sourceDatabase`/`targetDatabase` diferentes em duas chamadas, gerando dois jobs independentes contra bancos diferentes (cenário-chave de `requirements.md#7`, "Reaproveitar o mesmo perfil em migrações de bancos diferentes").

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
