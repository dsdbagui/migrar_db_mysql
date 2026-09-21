# Investigation: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`

## Pesquisa de fundo

Sem dependência externa nova. `mysql2` (`package.json`, `^3.11.0`) já suporta `connectTimeout` como opção nativa de `createConnection()` — não há necessidade de biblioteca adicional para a parte de conexão. O retry (3 tentativas, sem backoff) e o `Promise.race` em torno de `conn.ping()` são lógica local simples, sem padrão externo a pesquisar.

## Padrões aplicáveis

### Retry local vs. biblioteca de retry

- **Loop manual dentro de `connect()`** (escolhido, D-01 do `roadmap.md`): 3 tentativas fixas, sem backoff, decidido explicitamente em `/reversa-clarify`. Implementação é um `for` simples — não justifica trazer uma dependência (`p-retry`, `async-retry` etc.) para um caso tão restrito (contagem fixa, sem backoff, sem jitter).
- **Alternativa descartada**: biblioteca de retry com backoff exponencial configurável — rejeitada porque o operador decidiu explicitamente por retry fixo sem backoff (ver `requirements.md#9-esclarecimentos`, pergunta 1); adicionar uma lib para um caso mais simples do que ela resolve seria sobre-engenharia.

### `ping()` sem timeout nativo no `mysql2`

O driver `mysql2` (tanto na API de callback quanto na `/promise`) não expõe uma opção de timeout para `Connection.ping()` — ele herda o timeout de socket já aberto, que pode nunca disparar se o servidor parou de responder sem fechar o socket (caso central do DEBT-001 original). O padrão usado aqui é envolver a chamada num `Promise.race([ping(), timeoutPromise(30000)])`, descartando a promessa perdedora — padrão comum para "timeout de operação" em código Node.js quando a biblioteca subjacente não expõe a opção nativamente. Não há necessidade de biblioteca externa para isso (`Promise.race` é suficiente).

### Onde persistir a mensagem de erro de um job

Investigado o schema atual (`src/core/db/migrations/001_init.sql`) e o comportamento de `runJob`/`getJobStatus` (`jobRunner.ts`) antes de decidir D-03/D-04 do `roadmap.md`:

- `migration_jobs` não tem nenhuma coluna de mensagem de erro hoje — só `status` (enum).
- `job_items.apply_error` existe, mas é por item; uma falha de conexão pode ocorrer *antes* de qualquer item ser conhecido (a extração inicial de rotinas/tabelas depende da mesma conexão que pode estar morta).
- `logger.ts` já tem um comentário próprio dizendo que é "o ponto de extensão futuro para persistir eventos de job" — confirmando que a intenção arquitetural original já prenunciava essa necessidade, só nunca foi implementada. A opção escolhida (D-03, coluna dedicada em `migration_jobs`) é o caminho mais direto e mínimo para fechar esse gap dentro do escopo desta feature, sem assumir a tarefa maior de "persistir todos os logs" que o comentário sugere como visão de longo prazo.

## Links para fontes externas

Nenhum. Toda a base de decisão vem de artefatos internos já produzidos pelo Reversa (`_reversa_sdd/`, `_reversa_sdd/migration/`) e do código-fonte já implementado em `src/`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
