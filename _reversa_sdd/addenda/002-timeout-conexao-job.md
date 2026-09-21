# Adendo: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-21.

## Resumo da entrega

Restaura o timeout de conexão MySQL na versão web (`connectionManager.ts`), que não existia — diferente do legado, que já tinha `connection_timeout=10` em `connect()` (`migrate_routines.py:248-253`). Sem isso, uma conexão morta (rede degradada, servidor travado sem fechar o socket) deixava um job preso em `status: "running"` para sempre, sem nenhum sinal de falha para o operador. A entrega adiciona: `connectTimeout` de 30s (decidido em `/reversa-clarify`, maior que o valor do legado por escolha do operador) com retry de 3 tentativas sem backoff em `connect()`; o mesmo teto aplicado a `ensureConnected`/`conn.ping()`; e persistência da mensagem de erro (`migration_jobs.error_message`, coluna nova) para que o wizard web possa exibi-la nas telas de acompanhamento e resultado. 14/14 ações de `actions.md` concluídas, 53 testes automatizados verdes (16 novos).

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 47 (Core — Connection Manager) | regra-alterada | `connect()` ganhou `connectTimeout` (30s) + retry (3 tentativas, sem backoff); `ensureConnected` passou a delegar reconexão para `connect()` e a limitar `conn.ping()` ao mesmo teto — detalhe completo em `_reversa_forward/002-timeout-conexao-job/legacy-impact.md` |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 49 (Core — Job Runner) | delta-de-dados | Nova coluna `migration_jobs.error_message` (`TEXT NULL`), preenchida no `catch` de `runJob` antes de marcar o job `failed` |
| `_reversa_sdd/migration/target_architecture.md` | `#Componentes`, linha 49 (Core — Job Runner) | delta-de-contrato-externo | `GET /{feature}/jobs/:id` (via `getJobStatus`) passou a incluir `errorMessage: string \| null` no payload — aditivo, não remove nenhum campo existente. Contrato detalhado em `_reversa_forward/002-timeout-conexao-job/interfaces/job-status.md` |
| `_reversa_sdd/migracao-de-tabelas/requirements.md:54`, `_reversa_sdd/migracao-de-rotinas/requirements.md:46` | Requisitos Não Funcionais | regra-alterada (correção de leitura) | Essas linhas registravam "sem timeout/paralelismo explícitos" como lacuna do legado — leitura incompleta: o legado tinha timeout de *conexão* (`connection_timeout=10`), só não tinha timeout de *query*. A versão web agora tem timeout de conexão (30s, maior que o legado) + retry; timeout de query continua fora de escopo (decisão explícita, ver `requirements.md#9` da feature) |
| Telas do wizard (`web/src/screens/jobStatus.ts`, `jobResult.ts`), entregues por `001-frontend-wizard-migracao-web` | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md § Impacto por artefato` | regra-alterada | As duas telas passam a exibir `errorMessage` quando `status === "failed"`, além do que já foi documentado na entrega da feature `001` |

## Regras sob vigilância

- `W001` — ver `_reversa_forward/002-timeout-conexao-job/regression-watch.md`

## Fontes

- `_reversa_forward/002-timeout-conexao-job/requirements.md`
- `_reversa_forward/002-timeout-conexao-job/roadmap.md`
- `_reversa_forward/002-timeout-conexao-job/legacy-impact.md`
- `_reversa_forward/002-timeout-conexao-job/regression-watch.md`
- `_reversa_forward/002-timeout-conexao-job/progress.jsonl`
