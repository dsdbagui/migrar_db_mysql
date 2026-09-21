# Regression Watch: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|-------------------------------|----------------------|---------------------|
| W001 | `legacy-impact.md § Modificadas` (2º item); `interfaces/job-status.md` | `GET /{feature}/jobs/:id` inclui o campo `errorMessage: string \| null` no payload de resposta, sempre presente | presença | Uma re-extração futura não encontra `errorMessage` no contrato de `GET /{feature}/jobs/:id` documentado, ou o campo desaparece do tipo de retorno de `getJobStatus` em `src/core/jobRunner.ts` |

## Observações

<!-- Itens sem peso de regressão: infraestrutura nova sem regra 🟢 de domain.md de origem, ou comportamento que ainda não foi confirmado por uma extração completa. -->

- **Tempo até reportar erro de conexão não recuperável** (`legacy-impact.md § Modificadas`, 1º item): `connect()` agora faz até 3 tentativas antes de propagar qualquer erro, incluindo erros não recuperáveis por retry (senha errada, host inexistente). Não há regra 🟢 de `domain.md` de origem (comportamento de infraestrutura, decisão de `/reversa-clarify`, sem equivalente no legado síncrono) — por isso fica aqui, não no watch principal. Vale reavaliar se, na prática, esse tempo de até ~90s para erros de configuração incomodar operadores.
- **RF-01 a RF-06** (`_reversa_forward/002-timeout-conexao-job/requirements.md`): timeout de conexão (30s), retry (3 tentativas sem backoff), timeout de `ping()` em `ensureConnected`, fallback de timeout inválido, persistência de `error_message`, e log por tentativa. Todos implementados e cobertos por `tests/core/connectionManager.test.ts`/`tests/core/jobRunner.test.ts` (16 testes verdes), mas ainda não confirmados por uma extração reversa (`/reversa`) completa sobre o código Node/TS — ganham peso de regressão formal (🟢, watch principal) quando uma futura re-extração os capturar em `code-analysis.md`/`domain.md`.

## Histórico de re-extrações

_(vazio — preenchido pelo agente reverso na próxima execução de `/reversa` sobre este código)_

## Arquivadas

_(vazio)_
