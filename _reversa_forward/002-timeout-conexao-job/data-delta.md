# Data Delta: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`

## Resumo

Uma coluna nova em `migration_jobs`. Nenhuma tabela nova, nenhuma remoção. O delta existe porque hoje não há onde persistir a mensagem de erro de um job que falha inteiro (ver `investigation.md` § "Onde persistir a mensagem de erro de um job").

## Campos novos

| Tabela | Campo | Tipo | Nullable | Descrição |
|--------|-------|------|----------|-----------|
| `migration_jobs` | `error_message` | `TEXT` | Sim (`NULL` por padrão) | Mensagem do erro que causou `status = 'failed'`, preenchida pelo `catch` de `runJob` (`jobRunner.ts:229-233`). `NULL` para jobs `completed`/`cancelled`/em andamento, ou para jobs `failed` anteriores à migração (sem backfill) |

## Campos removidos

Nenhum.

## Migrações necessárias

Novo arquivo `src/core/db/migrations/002_add_job_error_message.sql`:

```sql
ALTER TABLE migration_jobs
  ADD COLUMN error_message TEXT NULL AFTER status;
```

Sem backfill: jobs já `failed` antes desta migração ficam com `error_message IS NULL` — aceitável, não há como reconstruir a mensagem original (só existia em `stdout`, não persistida).

## Paridade com o legado

n/a — o legado (`migrate_routines.py`) era síncrono, de processo único; um erro de conexão simplesmente abortava a execução com `error()` impresso no terminal e o processo terminava (`sys.exit`/exceção não capturada). Não existe um "job" persistido no legado para comparar — este é um problema novo, introduzido pela própria arquitetura de job em background (`_reversa_sdd/migration/target_architecture.md#AD-01`), que o legado síncrono nunca precisou resolver.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
