# Interface: `POST /jobs/:id/cancel`

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`
> Contrato novo (D-03 do `roadmap.md`)

## Onde vive

`src/features/jobs/routes.ts` (pasta nova) — `registerJobRoutes(app)`, registrado em `src/app.ts` ao lado de `registerRoutinesRoutes`/`registerTablesRoutes`/`registerReportsRoutes`/`registerProfileRoutes`.

## Request

`POST /jobs/:id/cancel`

- `id`: UUID do job (`migration_jobs.id`), na URL.
- Sem corpo de requisição.

## Response

**200 — cancelamento aceito** (job estava `pending` ou `running`):

```json
{ "id": "<uuid>", "status": "cancelled" }
```

**404 — job não encontrado**:

```json
{ "error": "job não encontrado" }
```

**409 — job já em status terminal** (`completed`, `failed`, ou já `cancelled` — os três tratados igual, sem exceção idempotente, decidido em `/reversa-clarify`):

```json
{ "error": "job já está em status terminal (<status atual>)" }
```

## Erros

Cobertos acima (`404`, `409`). Nenhum outro código de erro esperado em operação normal (erro de banco indisponível cai no tratamento de erro genérico do Fastify, fora do escopo desta interface).

## Idempotência

**Não idempotente no sentido de "repetir sem efeito colateral silencioso"**: a primeira chamada bem-sucedida transiciona `pending`/`running` → `cancelled` (`200`); toda chamada seguinte no mesmo job retorna `409`, nunca `200` de novo — decisão explícita em `/reversa-clarify` (RF-02), rejeitando o padrão comum de "cancelar duas vezes é sucesso silencioso na segunda vez".

## Timeouts

Não aplicável como contrato HTTP em si — é uma escrita simples no App DB (`UPDATE migration_jobs ... WHERE id = ? AND status IN ('pending','running')`), sem abrir conexão MySQL de origem/destino. O efeito do cancelamento sobre o job em execução **não é imediato**: o loop de processamento (`routines/service.ts`, `tables/service.ts`) só verifica o status a cada item — ver RN-03/RNF de Resiliência em `requirements.md`.

## Compatibilidade com clientes existentes

Contrato inteiramente novo — não há cliente prévio a quebrar. O cliente web (`web/src/api.ts`) ganha um método novo `cancelJob(jobId)` para consumi-lo (sem parâmetro `feature` — a rota é transversal, `/jobs/:id/cancel`, diferente de `/{feature}/jobs/:id` usado por `getJobStatus`).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
