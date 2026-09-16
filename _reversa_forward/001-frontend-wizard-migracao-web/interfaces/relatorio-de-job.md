# Interface: Relatório de Job

> Identificador da feature: `001-frontend-wizard-migracao-web`
> Tipo: HTTP
> Novo contrato (não existe hoje em `src/features/`) — decidido em `roadmap.md` D-03/D-04, motivado por RF-10.

## Visão geral

Endpoint transversal (fora dos namespaces `/routines` e `/tables`, já que `migration_jobs`/`job_reports` são genéricos por `job.id`) que gera e serve o relatório consolidado de um job, nos 3 formatos funcionais definidos por BR-MIGRAR-016 (dados estruturados, visualização humana, SQL de auditoria/replay) mais a variante de retry.

## `POST /jobs/:id/report`

Gera (ou regenera) o relatório de um job e persiste em `job_reports`.

- **Request**: sem corpo. `:id` é o `migration_jobs.id`.
- **Pré-condição**: `migration_jobs.status` deve ser terminal (`completed`, `failed` ou `cancelled`). Job `pending`/`running` retorna erro — os dados ainda podem mudar.
- **Response 201/200**: `{ "jobId": "...", "generatedAt": "..." }` (201 na primeira geração, 200 numa regeneração — mesmo `job_id`, upsert via `UNIQUE KEY uq_job_reports_job`).
- **Erros**:
  - `404` — job não encontrado.
  - `409` — job ainda não está em status terminal (`{"error": "job ainda em execução"}`).
- **Idempotência**: idempotente para um job terminal — chamadas repetidas sobrescrevem o mesmo registro em `job_reports` (mesmo conteúdo, salvo se `job_items` tiver sido alterado entre chamadas, o que não deveria acontecer para um job terminal).
- **Timeout**: geração é síncrona, mas não depende de I/O externo (MySQL origem/destino) — só lê `job_items`/`job_item_fk_specs` já persistidos no App DB. Não deve se aproximar de timeouts HTTP padrão mesmo em jobs com muitos itens.

## `GET /jobs/:id/report?format=json|html|sql|retry`

Retorna uma variante do relatório já gerado.

- **Request**: query param `format`, default `json` se omitido.
- **Response 200**:
  - `format=json` → `Content-Type: application/json`, corpo = `job_reports.report_json` (schema espelhando `report_data` legado, ver `data-delta.md`).
  - `format=html` → `Content-Type: text/html`, corpo = `job_reports.report_html`.
  - `format=sql` → `Content-Type: text/plain`, corpo = `job_reports.migration_sql`.
  - `format=retry` → `Content-Type: text/plain`, corpo = `job_reports.retry_sql`.
- **Erros**:
  - `400` — `format` fora do conjunto válido.
  - `404` — job não encontrado, OU relatório ainda não gerado (nenhuma linha em `job_reports` para esse `job_id` — o cliente deve chamar `POST` primeiro), OU `format=retry` pedido mas `retry_sql IS NULL` (job sem itens com erro — não há retry a oferecer, espelha o comportamento legado de não gerar `retry_*.sql` quando não há erro).
- **Idempotência**: leitura pura, sem efeito colateral.
- **Timeout**: leitura de uma linha já persistida — trivial.

## Consumo pelo wizard (RF-10)

A tela de resultado (pós-job terminal) chama `POST /jobs/:id/report` uma vez ao entrar na tela (ou sob ação explícita "Gerar relatório"), depois oferece os links/downloads dos 4 `GET` acima. Se `POST` falhar com `409` (job ainda rodando), a tela de resultado não deveria ter sido alcançável nesse estado — é um guard adicional de defesa, não o fluxo esperado.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-plan` | reversa |
