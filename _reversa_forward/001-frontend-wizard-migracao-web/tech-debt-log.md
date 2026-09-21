# Débito técnico registrado (fora do escopo desta feature)

> Feature: `001-frontend-wizard-migracao-web`
> Origem: observado em sessão de trabalho, não bloqueia esta entrega — registrado para tratar depois.
> Data: `2026-09-21`

Nenhuma ação foi tomada sobre os itens abaixo. Este arquivo só documenta os gaps para priorização futura.

## DEBT-001 — Sem timeout de conexão/query no `connectionManager.ts`

**Onde:** `src/core/connectionManager.ts:21-37` (`connect()`), usado também por `connectWithAutoCreateDatabase` e `ensureConnected`.

**Problema:** `mysql.createConnection()` é chamado sem `connectTimeout` nem `pool`/`queryTimeout` configurado. Se a conexão cair de um jeito que não gere um erro de socket imediato (rede degradada, MySQL travado, firewall descartando pacotes silenciosamente), a chamada fica pendurada indefinidamente. Como `runJob` (`src/core/jobRunner.ts:202`) executa o job de forma awaited, um job trava para sempre sem nunca transicionar para `failed` — e sem esse timeout, nem `ensureConnected`'s `conn.ping()` (linha 80) tem um limite de tempo para detectar a queda.

**Impacto:** job fica em `status: "running"` indefinidamente; usuário do wizard não recebe erro algum, só um polling que nunca termina (`JobStatus.*` no frontend, T015 de `actions.md`).

**Direção sugerida (não implementada):** adicionar `connectTimeout` (ex. 10s) nos params passados a `mysql.createConnection`, e considerar `queryTimeout` via `mysql2` ou um `Promise.race` com timeout ao redor de operações longas (especialmente cópia de dados em `copyData.ts`).

## DEBT-002 — Sem endpoint de cancelamento de job

**Onde:** `src/core/jobRunner.ts:20` declara `JobStatus` incluindo `"cancelled"`; `src/features/reports/routes.ts:49` já trata `"cancelled"` como status terminal válido para relatório. Mas não existe nenhuma rota (`routines/routes.ts`, `tables/routes.ts` ou um endpoint transversal) que escreva esse status.

**Problema:** o enum e o código de leitura (reports) já assumem que um job pode ser cancelado, mas nada no sistema aciona essa transição — um job iniciado só termina sozinho (`completed`/`failed`), nunca por ação do usuário.

**Impacto:** usuário não tem como interromper um job de longa duração disparado por engano (ex. migração de tabela grande com `copyData: true`) a não ser esperar terminar ou derrubar o processo do backend.

**Direção sugerida (não implementada):** endpoint tipo `POST /jobs/:id/cancel` (transversal, ao lado do futuro `/jobs/:id/report`) que marca o job como `cancelled` em `migration_jobs` e sinaliza o loop de `runJob`/`persistItem` (`src/core/jobRunner.ts:150,202`) para parar antes do próximo item — exige um mecanismo de cooperação (flag checada entre itens), já que não há cancelamento de query em voo sem o DEBT-001 resolvido primeiro.

## DEBT-003 — Mitigação proposta para RISK-005 (superfície de ataque do cofre de credenciais)

**Onde:** `src/core/credentialVault.ts:31,51-101` — `connection_profiles.password_enc`, gravado por `createProfile` (linha ~93) e cifrado por `encryptPassword` (linha 51).

**Contexto — decisão já tomada:** `BR-HUMANA-002` (`_reversa_sdd/migration/target_business_rules.md:207-213`) já resolveu, com decisão humana de 2026-09-15, que a versão web teria um cofre de credenciais com senha cifrada em repouso (opção b, perfis nomeados e reutilizáveis). Essa decisão está implementada — é o que `credentialVault.ts` faz hoje. **Este item não reabre BR-HUMANA-002**; propõe uma forma de mitigar o risco que a própria BR-HUMANA-002 previu como consequência (ver `target_business_rules.md:211`: "é uma decisão de segurança que extrapola o que as specs do legado documentam").

**Risco associado:** `RISK-005` (`_reversa_sdd/migration/risk_register.md:65-74`) — "o cofre de credenciais (BR-HUMANA-002 resolvida) introduz uma superfície de ataque nova que não existia no legado (onde a senha nunca era persistida, só digitada por sessão de terminal)". Severidade combinada: média (probabilidade baixa, impacto alto). Mitigação já registrada no risk register: cifrar em repouso com chave fora do banco da aplicação + nunca logar a senha. Esta entrada complementa essa mitigação, não a substitui.

**Mitigação adicional proposta (não implementada) — meio-termo:**
Manter os perfis nomeados (`host`/`port`/`user`/`database`, sem senha) persistidos em `connection_profiles` como hoje, mas remover `password_enc` da tabela: a senha passa a ser pedida ao operador só no momento de disparar o job (Etapa de confirmação do wizard, T014 de `actions.md`), mantida apenas em memória do processo do job runner durante a execução, e descartada ao final (sucesso, falha ou cancelamento — ver DEBT-002).

- **Ganho:** elimina o vetor descrito em RISK-005 — um dump do App DB (`connection_profiles`) não expõe mais nenhuma credencial MySQL, mesmo com a chave de cifragem comprometida, porque não há mais segredo persistido para decifrar.
- **O que se preserva:** ainda evita redigitar host/porta/usuário/banco a cada execução — o ganho de UX central do cofre (BR-HUMANA-002) continua de pé, só a senha deixa de ser lembrada entre execuções.
- **Custo:** volta a exigir 1 campo de senha por execução (como o CLI legado fazia) — trade-off explícito entre conveniência e superfície de ataque, a ser confirmado com o Owner de RISK-005 (Área de Infraestrutura) antes de implementar.
- **Impacto em código, se adotado:** remove `password_enc`/`encryptPassword`/`decryptPassword` de `credentialVault.ts`; `ConnectionParams` (`connectionManager.ts:11-17`) passaria a receber a senha vinda do payload do job (`CreateJobInput`, `jobRunner.ts:61`) em vez do perfil salvo; migração de schema para dropar a coluna `password_enc` de `connection_profiles`.

## DEBT-004 — Sem tela de histórico de jobs

**Onde:** `web/src/screens/` só tem `jobStatus.ts` (acompanhamento de um job em andamento) e `jobResult.ts` (resultado final de um job) — ambos navegados a partir do `jobId` retornado por `POST /{feature}/jobs` (`confirmSubmit.ts`), nunca a partir de uma listagem. No backend, `src/features/routines/routes.ts` e `src/features/tables/routes.ts` só expõem `GET /{feature}/jobs/:id` (por id) — não existe `GET /jobs` nem `GET /{feature}/jobs` para listar. `jobRunner.ts` também não tem uma função equivalente a `getJobStatus` (linha 236) que liste jobs em vez de buscar um único id.

**Problema:** o `jobId` só existe na navegação em memória do wizard (estado de `web/src/wizard/state.*`, T018 de `actions.md`) — se a aba fecha, dá refresh, ou o operador simplesmente esquece de copiar o id antes de sair da tela de resultado, não há como recuperar aquele job depois. Isso não é uma lacuna teórica: toda vez que alguém precisar checar "o que rodou ontem" ou "aquele job travou, qual foi o resultado mesmo?" sem o id em mãos, esbarra nisso de novo.

**Impacto:** nenhuma forma de auditoria/consulta retroativa de jobs pela UI — dado que `migration_jobs`/`job_items`/`job_reports` já persistem tudo no App DB, a informação existe, só não é alcançável sem o id.

**Direção sugerida (não implementada):** endpoint `GET /jobs` (transversal, mesmo padrão de `/jobs/:id/report`) com paginação simples e filtro por `feature`/`status`, lendo `migration_jobs` (já tem tudo: `feature`, `status`, `startedAt`, `finishedAt`); tela `web/src/screens/jobHistory.*` listando isso com link para `jobStatus.*`/`jobResult.*` de cada item, reaproveitando a navegação já existente.

---

**Nota:** este arquivo foi criado fora do fluxo padrão dos agentes Reversa (não é um artefato de `/reversa-forward` nem de `/reversa-migrate`) porque não existe hoje um artefato canônico de "débito técnico" no pipeline. Se o time adotar `/reversa-refactor` ou `/reversa-debugger` para isso no futuro, migrar este conteúdo para o local apropriado.
