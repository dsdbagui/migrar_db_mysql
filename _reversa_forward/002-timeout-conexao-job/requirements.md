# Requirements: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O `connectionManager.ts` da versão web não configura nenhum timeout ao abrir conexão MySQL (`mysql.createConnection`), diferente do legado Python, que já tinha `connection_timeout=10` explícito. Isso significa que uma conexão morta (rede degradada, servidor travado, firewall descartando pacotes silenciosamente) nunca gera erro — o job fica em `status: "running"` para sempre, sem que o operador do wizard receba qualquer sinal de falha. Esta feature restaura essa proteção com um timeout de conexão de 30s e até 3 tentativas automáticas de reconexão antes de marcar o job como `failed` (decidido em sessão de `/reversa-clarify` de 2026-09-21); timeout de *query* para operações de cópia de dados longas fica fora do escopo desta feature.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `migrate_routines.py:248-253` (citado em `_reversa_sdd/code-analysis.md` linha 30, função `connect()`) | O legado já chama `mysql.connector.connect(..., connection_timeout=10)` — inclusive na conexão administrativa de auto-criação de banco (linhas 273-274). A porta Node/TS (`src/core/connectionManager.ts:21-37`) **não replicou** esse parâmetro: é uma regressão de comportamento, não uma lacuna nova. | 🟢 |
| `_reversa_sdd/code-analysis.md#ensure_connected()` (linha 32, `migrate_routines.py:325`) | `ensure_connected()` reconecta se `conn.is_connected()` for falso, chamado antes de blocos longos porque "migrações de tabelas com muitos dados podem deixar a conexão ociosa tempo suficiente para o servidor derrubá-la". O equivalente web, `connectionManager.ts:74-87` (`ensureConnected`), usa `conn.ping()`, que no driver `mysql2` não aceita um timeout nativo. | 🟢 |
| `_reversa_sdd/migracao-de-tabelas/requirements.md:54` e `_reversa_sdd/migracao-de-rotinas/requirements.md:46` | Ambos registram "sem timeout/paralelismo explícitos" como lacuna de NFR do legado — **essa leitura está incompleta**: não existe timeout de *query*, mas existe timeout de *conexão* (`connection_timeout=10`), confirmado por leitura direta do código acima. Esta feature deve tratar essa distinção com cuidado, não assumir que "timeout" era zero no legado. | 🟢 |
| `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-017` | Regra de resiliência já estabelecida para outro caso (falha ao salvar relatório não deve invalidar a migração já aplicada) — mesmo espírito de "falha de infraestrutura não deve travar/perder trabalho silenciosamente" se aplica aqui, ainda que a regra original seja sobre persistência de relatório, não sobre conexão. | 🟡 |
| `src/core/jobRunner.ts:202` (`runJob`), `:150` (`persistItem`) | O job roda de forma `await`ada de ponta a ponta; qualquer chamada pendurada dentro do `FeatureRunner` (que usa `connectionManager.ts` internamente) trava o `runJob` inteiro, sem transição para `failed`. | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador (via wizard web, único stakeholder declarado — Área de Infraestrutura) | Confiar que um job sempre termina (sucesso ou falha), nunca fica pendurado sem explicação | Dispara uma migração de tabela grande contra um MySQL de origem que fica inacessível no meio da execução (rede cai, servidor trava) e precisa saber, pela tela de acompanhamento, que o job falhou — não ficar olhando um polling infinito |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Toda tentativa de estabelecer conexão MySQL (origem, destino, e a conexão administrativa usada por `connectWithAutoCreateDatabase`) deve respeitar um timeout de conexão de 30s — valor decidido em `/reversa-clarify` (sessão 2026-09-21), maior que o `connection_timeout=10` do legado por escolha explícita do operador, não por paridade estrita. 🟢
   - Origem no legado: `migrate_routines.py:248-253` (`connect()`, `connection_timeout=10`) — não há entrada equivalente em `_reversa_sdd/domain.md`, pois é comportamento de infraestrutura, não regra de negócio de migração.
   - Tipo: alterada (regressão corrigida — comportamento existia no legado e foi perdido no port Node/TS; valor numérico ajustado por decisão do operador)
2. **RN-02:** Quando uma conexão MySQL não responde dentro do timeout configurado, o sistema deve tentar reconectar automaticamente até 3 vezes (sem backoff) antes de desistir. Se qualquer tentativa dentro desse limite tiver sucesso, o job continua normalmente; esgotadas as 3 tentativas, o job correspondente deve transicionar para `status: "failed"` com uma mensagem de erro identificável (não deve permanecer em `running` indefinidamente). 🟢
   - Origem no legado: não há equivalente direto — o CLI legado simplesmente encerrava o processo com um erro impresso no terminal (`error()`), sem retry automático (a única retentativa era via prompt interativo `"Tentar novamente?"` em `ask_connection`); o equivalente assíncrono aqui é o job tentar reconectar sozinho antes de fechar como `failed` persistido em `migration_jobs`.
   - Tipo: nova (decorrente da arquitetura de job em background, que o legado síncrono não tinha)
   - Decidido em `/reversa-clarify` (sessão 2026-09-21): retry automático fixo, N=3 tentativas, sem backoff.

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | `connectionManager.ts:connect()` deve passar `connectTimeout` para `mysql.createConnection`, com valor default de 30000ms (decidido em `/reversa-clarify`, maior que o `connection_timeout=10` do legado por escolha do operador) | Must | Uma conexão a um host inalcançável (ex. IP não roteável) falha em ~30s com erro claro, em vez de ficar pendurada | 🟢 |
| RF-02 | `connectWithAutoCreateDatabase` deve aplicar o mesmo `connectTimeout` também na conexão administrativa usada para `CREATE DATABASE` | Must | Falha de conexão na etapa de auto-criação de banco também respeita o teto de 30s | 🟢 |
| RF-03 | `ensureConnected` deve limitar o tempo de espera do `conn.ping()` (hoje sem timeout nativo no `mysql2`) ao mesmo teto de 30s, reconectando ou falhando dentro desse tempo previsível | Must | Uma conexão que parou de responder a pacotes (sem fechar o socket) é detectada e tratada dentro de 30s, não trava `ensureConnected` indefinidamente | 🟡 |
| RF-04 | Quando um timeout de conexão ocorre durante a execução de um job, o sistema deve tentar reconectar automaticamente até 3 vezes (sem backoff); se todas falharem, o erro deve se propagar até `runJob`/`persistItem` de forma que o job feche como `failed` com mensagem clara, nunca fique preso em `running` | Must | Reproduzindo o cenário do DEBT-001 (conexão morta), o job faz até 3 tentativas de reconexão e, esgotadas, transiciona para `failed` em vez de ficar pendurado indefinidamente | 🟢 |
| RF-05 | Se um valor de timeout ausente, zero ou negativo chegar à configuração do `connectionManager`, o valor efetivo aplicado deve cair para o default seguro (30000ms), nunca resultar em "sem timeout" | Must | Instanciar a conexão com timeout inválido/ausente produz o mesmo comportamento de proteção do RF-01, verificável pelo valor efetivamente repassado ao driver | 🟢 |
| RF-06 | Cada tentativa de reconexão (até o limite de 3, RF-04) deve ser logada individualmente, indicando o número da tentativa | Should | Log mostra tentativa 1/3, 2/3, 3/3 antes da falha final, facilitando diagnóstico | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Resiliência | O timeout de 30s não deve gerar falsos positivos em conexões saudáveis mas momentaneamente lentas (ex. cold start de rede interna) | Valor maior que o `connection_timeout=10` do legado (decisão explícita do operador em clarify), o que já dá margem extra em relação ao comportamento testado em produção no legado | 🟢 |
| Resiliência (retry) | Ao estourar o timeout de conexão, o sistema deve tentar reconectar até 3 vezes (sem backoff) antes de desistir | Decisão explícita em `/reversa-clarify` (sessão 2026-09-21, pergunta 1, opção b) | 🟢 |
| Observabilidade | Ao estourar o timeout (após as 3 tentativas), o erro deve ser logado via `logger.error` (mesmo padrão já usado em `connectionManager.ts:34`), incluindo host, label da conexão (origem/destino) e quantas tentativas foram feitas | Consistente com o padrão de log já existente no arquivo | 🟢 |
| Compatibilidade | A mudança não deve alterar o comportamento de conexões saudáveis (tempo de resposta normal) de nenhuma forma observável pelo operador | Regra geral de não regressão ao corrigir um bug de robustez | 🟢 |
| Escopo (concorrência) | Fora de escopo: pool de conexões compartilhado ou coordenação entre jobs concorrentes — cada job continua abrindo suas próprias conexões via `connectionManager`, sem alterar essa topologia | Não há pool hoje (`mysql.createConnection` por chamada); introduzir um seria mudança arquitetural maior que o gap relatado justifica | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Timeout de conexão esgota as tentativas e o job falha corretamente
  Dado um job em execução que depende de uma conexão MySQL de origem ou destino
  E essa conexão se torna inacessível sem fechar o socket (timeout de rede, não erro imediato)
  Quando o tempo de conexão exceder o timeout configurado (30s) em todas as 3 tentativas automáticas de reconexão
  Então o job deve transicionar para `status: "failed"`
  E a mensagem de erro deve indicar timeout de conexão, quantas tentativas foram feitas, e o host/label afetado

Cenário: Reconexão bem-sucedida dentro do limite de tentativas não falha o job
  Dado um job em execução cuja conexão MySQL falha na 1ª tentativa por timeout
  Quando uma das tentativas seguintes (até a 3ª) conecta com sucesso
  Então o job continua normalmente, sem transicionar para `failed`

Cenário: Timeout ausente ou inválido cai para o default seguro
  Dado um valor de timeout de conexão ausente, zero ou negativo chega à configuração do connectionManager
  Quando uma conexão MySQL é aberta
  Então o timeout efetivo aplicado deve ser o default de 30000ms
  E em nenhum caso a conexão deve ficar sem nenhum timeout configurado
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01, RF-02 | Must | Núcleo do gap relatado (DEBT-001) — sem isso a conexão morta continua travando o job para sempre |
| RF-04 | Must | Sem essa propagação, mesmo com timeout configurado o job pode não fechar corretamente como `failed` |
| RF-03 | Must | `ensureConnected` é chamado nos pontos de maior risco (cópia de dados longa) — deixar de fora reabriria o mesmo gap pela porta dos fundos |
| RF-05 | Must | Sem esse fallback, uma falha de configuração (valor ausente/zero) reabriria silenciosamente o mesmo bug que esta feature existe para fechar |
| RNF de observabilidade | Should | Facilita diagnóstico, mas não é o que impede o job de travar |
| Timeout de query para cópia de dados | Won't (decidido) | Decisão explícita em `/reversa-clarify` (sessão 2026-09-21): fora do escopo desta feature, sem data definida — ver seção Esclarecimentos |

## 9. Esclarecimentos

### Sessão 2026-09-21

- **Q:** Um timeout de *query* (não só de conexão) deve ser aplicado às operações de cópia de dados (`copyData.ts`)?
  **R:** Não — nesta feature só timeout de conexão (RF-01/02/03). Query timeout fica de fora, sem data definida (opção a).
- **Q:** Ao estourar o timeout de conexão, o job deve falhar na primeira tentativa ou tentar reconectar automaticamente antes de marcar `failed`?
  **R:** Retry automático fixo, N = 3 tentativas, sem backoff, antes de marcar `failed` (opção b).
- **Q:** O valor de 10000ms (paridade com o legado) é adequado, ou deveria ser configurável?
  **R:** Usar outro valor fixo: 30000ms (opção c) — não configurável por ambiente nesta rodada.

## 10. Lacunas

Nenhuma lacuna pendente — as 3 dúvidas do documento inicial foram resolvidas em `/reversa-clarify` (sessões de 2026-09-21, ver Esclarecimentos acima).

## Pendências de Qualidade

- **Q-017/Q-018 (SoluçãoImplícita)** — este documento cita nomes de driver/parâmetro (`mysql2`, `connectTimeout`, `conn.ping()`) em vez de ficar só no "quê". Exceção deliberada: a própria natureza da feature é restaurar um parâmetro específico que existia no legado (`connection_timeout` em `migrate_routines.py:248-253`) e foi perdido no port — descrever o gap sem nomear o parâmetro/API exato tornaria o documento vago demais para orientar `/reversa-plan` a verificar a paridade correta. Mantido após 1 ciclo de revisão, sem nova tentativa de reescrita.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-09-21 | `/reversa-clarify`, sessão 1: resolvida DÚVIDA-1 (timeout de query fora do escopo) | reversa |
| 2026-09-21 | `/reversa-clarify`, sessão 2: resolvidas DÚVIDA-2 (retry fixo, N=3, sem backoff) e DÚVIDA-3 (timeout fixo em 30000ms, não configurável) — zero `[DÚVIDA]` pendentes | reversa |
