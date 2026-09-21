# Onboarding: Timeout de conexão e query no Job Runner

> Identificador: `002-timeout-conexao-job`
> Data: `2026-09-21`
> Passo a passo para um humano testar esta feature pela primeira vez.

## Pré-requisitos

1. Mesmo ambiente da feature `001-frontend-wizard-migracao-web` já rodando (`npm install`, `.env` preenchido, `CREDENTIAL_VAULT_KEY` configurada) — ver `_reversa_forward/001-frontend-wizard-migracao-web/onboarding.md`.
2. `npm run migrate` rodado **depois** que `src/core/db/migrations/002_add_job_error_message.sql` existir (passo do `/reversa-coding` desta feature) — sem isso, `error_message` não existe em `migration_jobs` e o backend vai falhar ao tentar gravar nela.
3. Uma forma de simular uma conexão MySQL morta sem fechar o socket — duas opções práticas:
   - Apontar um perfil de conexão para um IP não roteável na rede local (ex. `10.255.255.1`, geralmente não responde nem recusa, só absorve pacotes) — reproduz timeout de conexão inicial.
   - Depois de um job iniciar contra uma origem/destino real, bloquear a porta MySQL via firewall local (`iptables`/regra equivalente) a meio da execução — reproduz o caso de `ensureConnected` detectando queda em `conn.ping()`.

## Passo a passo

1. Suba o backend (`npm run dev`) já com a migração `002` aplicada.
2. Crie um perfil de conexão apontando para o IP não roteável do pré-requisito 3 (host inválido, porta 3306).
3. Dispare um job de rotinas ou tabelas usando esse perfil como origem ou destino.
4. Cronometre: o job deve transicionar para `status: "failed"` em torno de 90s (3 tentativas × até 30s cada, RN-02/RF-04) — não deve ficar em `running` além disso.
5. Consulte `GET /{feature}/jobs/:id` (ou a tela de resultado do wizard, se já tiver UI para exibir `errorMessage`) e confirme que `errorMessage` não é `null` e descreve um timeout de conexão.
6. Confira nos logs do processo (`stdout`, formato JSON de `logger.ts`) que aparecem até 3 linhas de tentativa (`1/3`, `2/3`, `3/3`) antes da falha final (RF-06).
7. **Caso de reconexão bem-sucedida**: repita o passo 3 contra um MySQL real e saudável, mas insira uma falha de rede breve (bloqueie a porta por poucos segundos e libere antes de completar 30s) durante a fase inicial de conexão. Confirme que o job continua normalmente e conclui como `completed` — nenhuma tentativa que teve sucesso deve deixar rastro de falha.
8. **Caso de timeout inválido cai para o default**: se o `connectTimeout` for exposto como configuração de ambiente/código nesta implementação, tente um valor `0` ou negativo e confirme (via log ou teste automatizado) que o valor efetivo aplicado continua sendo 30000ms (RF-05).

## Critério de sucesso do onboarding

- Passo 4: job falha em ~90s, nunca fica pendurado indefinidamente (era o bug original, DEBT-001).
- Passo 5: mensagem de erro visível via API, não só nos logs do processo.
- Passo 7: nenhuma regressão em conexões saudáveis — job com falha momentânea e recuperação automática conclui normalmente.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
