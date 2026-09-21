# Interface: `GET /jobs`

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Contrato novo (D-01/D-03/D-04 do `roadmap.md`)

## Onde vive

`src/features/jobs/routes.ts` — novo handler dentro de `registerJobRoutes(app)`, mesma função que já registra `POST /jobs/:id/cancel` (feature `003-cancelamento-de-job`). Já registrado em `src/app.ts:23` (`registerJobRoutes(app)`), nenhuma mudança de wiring necessária.

## Request

`GET /jobs`

Sem corpo. Query string opcional (D-04 — atende à NFR de Desempenho de `requirements.md`, sem elemento de UI correspondente nesta entrega):

| Parâmetro | Tipo | Obrigatório | Efeito |
|---|---|---|---|
| `feature` | um de `routines`\|`tables`\|`config`\|`reports`\|`collation_fix` | não | Filtra por `migration_jobs.feature`, usa `ix_migration_jobs_feature_status` |
| `status` | um de `pending`\|`running`\|`completed`\|`failed`\|`cancelled` | não | Filtra por `migration_jobs.status`, usa o mesmo índice |

Valor de `feature`/`status` fora do enum: `400` (mesma postura de validação que o resto do backend — corpo malformado é responsabilidade de quem chama).

## Response

**200 — sempre** (mesmo com zero jobs no banco — RF do cenário "Histórico vazio não quebra a tela"):

```json
[
  {
    "id": "0f2b...-uuid",
    "feature": "tables",
    "status": "completed",
    "startedAt": "2026-09-21T14:00:00.000Z",
    "finishedAt": "2026-09-21T14:03:12.000Z",
    "createdBy": "unknown",
    "errorMessage": null,
    "sourceProfileLabel": "Produção MySQL 5.7",
    "targetProfileLabel": "Homologação MySQL 8.0",
    "createdAt": "2026-09-21T14:00:00.000Z"
  }
]
```

Sempre os 50 mais recentes por `created_at DESC` (RF-01), sem envelope de paginação (`{ items: [...] }` ou similar) — array puro no nível raiz, igual ao já usado por `GET /connection-profiles` (`profileRoutes.ts:34-36`, que retorna `ConnectionProfile[]` direto).

`sourceProfileLabel` é `null` quando `source_profile_id` é `null` (jobs de `collation_fix` — ver D-03 do `roadmap.md`). `errorMessage` é `null` exceto quando `status === "failed"` (mesma regra já em vigor para `GET /{feature}/jobs/:id`, adendo `002`).

## Erros

`400` só no caso de `feature`/`status` fora do enum aceito (validação de querystring). Nenhum `404`/`409` — a rota não tem parâmetro de path, sempre responde alguma lista (mesmo vazia).

## Idempotência

Totalmente idempotente — é uma leitura pura, sem efeito colateral. Chamar repetidamente não altera nenhum estado.

## Timeouts

Não aplicável como contrato HTTP — é uma única query de leitura no App DB (um `SELECT` com dois `LEFT JOIN`), sem abrir conexão MySQL de origem/destino, mesma natureza de `GET /connection-profiles` e `GET /{feature}/jobs/:id`.

## Compatibilidade com clientes existentes

Contrato inteiramente novo — não há cliente prévio a quebrar. O cliente web (`web/src/api.ts`) ganha um método novo `listJobs(filters?)`, seguindo a mesma forma de `ApiResult<T>` já usada pelos demais métodos (`api.ts:12-39`).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
