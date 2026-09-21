# Interface: `GET /{feature}/jobs/:id`

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Contrato existente, alteração aditiva (não quebra clientes atuais)

## Onde vive

- `src/features/routines/routes.ts:48-52` (`GET /routines/jobs/:id`)
- `src/features/tables/routes.ts:47-51` (`GET /tables/jobs/:id`)

Ambas as rotas chamam a mesma função `getJobStatus` (`src/core/jobRunner.ts:236-251`) — a mudança é feita uma vez, em um lugar, e vale para as duas rotas.

## Request

Sem alteração. `GET /{routines|tables}/jobs/:id`, `id` = UUID do job (`migration_jobs.id`).

## Response — delta

Campo novo, sempre presente (pode ser `null`):

```jsonc
{
  "id": "string",
  "feature": "routines" | "tables" | "config" | "reports" | "collation_fix",
  "status": "pending" | "running" | "completed" | "failed" | "cancelled",
  "startedAt": "string | null",
  "finishedAt": "string | null",
  "errorMessage": "string | null",  // NOVO — mensagem de erro quando status === "failed"; null em qualquer outro status, ou se status === "failed" mas a falha ocorreu antes desta feature (job legado, error_message não retroativo)
  "items": [ /* inalterado */ ]
}
```

## Erros

Inalterado: `404 { "error": "job não encontrado" }` quando o `id` não existe.

## Idempotência

Inalterado — `GET` sem efeito colateral, idempotente por natureza.

## Timeouts

Não aplicável a este contrato HTTP em si (é uma leitura simples do App DB, não abre conexão MySQL de origem/destino). O timeout desta feature (RN-01/RF-01..03) é interno, entre o backend e os bancos MySQL sendo migrados — não entre o frontend e este endpoint.

## Compatibilidade com clientes existentes

Aditiva — clientes que ignoram campos desconhecidos (padrão em JSON) continuam funcionando sem alteração. A tela de resultado do wizard (`JobResult.*`, feature `001-frontend-wizard-migracao-web`) pode passar a exibir `errorMessage` quando presente, mas isso é opcional para esta feature (UX de exibição fica a critério do `/reversa-coding`, desde que o campo esteja disponível na API).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
