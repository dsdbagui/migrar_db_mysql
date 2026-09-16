# Perguntas para Validação — migra_db_mysql

> Gerado pelo Revisor em 2026-09-15, na fase de Revisão.
> `doc_level = "completo"` → todas as lacunas 🔴 identificadas nas units e nos artefatos globais estão listadas aqui (não apenas as que bloqueiam a reimplementação).
> Responda cada pergunta e me avise quando terminar (ou responda diretamente no chat).

---

## Bloco A — `migracao-de-rotinas`

### Pergunta 1 — ✅ Respondida

**Contexto:** `fetch_routines`/`apply_routine` capturam qualquer exceção como `extract_error`/`apply_error` genérico — não há tratamento diferenciado para erro de privilégio MySQL insuficiente (`migrate_routines.py:345`, `:728`; ver `permissions.md`, Lacunas).
**Spec afetada:** [`migracao-de-rotinas/design.md`](migracao-de-rotinas/design.md), [`permissions.md`](permissions.md)
**Pergunta:** Sem acesso a um MySQL real com usuário de privilégios restritos, não é possível confirmar se todo erro de privilégio insuficiente cai corretamente em `extract_error`/`apply_error`, ou se existe algum caso que propagaria uma exceção não tratada. Você já observou esse cenário em uso real (usuário sem `SHOW CREATE ROUTINE`, por exemplo)?
**Impacto:** Se houver um caso conhecido de exceção não tratada, isso vira uma lacuna 🔴 confirmada (não apenas hipotética) e um `Issue`/tratamento adicional deveria ser considerado na reimplementação.

**Resposta:** Sim, já vi funcionar bem em uso real. → Reclassificado 🔴→🟢 em `migracao-de-rotinas/design.md` e `permissions.md`.

### Pergunta 2 — ✅ Respondida

**Contexto:** As 9 transformações de DDL de rotina (`remove_definer` + 8 da lista `TRANSFORMATIONS`) não têm suíte de testes automatizados contra DDLs reais de produção (`domain.md`, Lacunas; `migracao-de-rotinas/tasks.md`, Lacunas Pendentes).
**Spec afetada:** [`migracao-de-rotinas/tasks.md`](migracao-de-rotinas/tasks.md)
**Pergunta:** Existe algum conjunto de DDLs de produção (anonimizados) que possa ser usado como suíte de regressão ao reimplementar essas transformações? Ou a reimplementação deve partir do zero nesse quesito?
**Impacto:** Define se a tarefa TT-01/TT-04 de `tasks.md` pode reaproveitar casos reais ou precisa ser construída puramente a partir da leitura do código.

**Resposta:** Não há DDLs reais disponíveis — a suíte de testes da reimplementação precisa ser construída do zero (sintética). Permanece 🔴, mas com direção definida.

---

## Bloco B — `migracao-de-tabelas`

### Pergunta 3 — ✅ Respondida

**Contexto:** `find_referencing_fks`/`drop_referencing_fks` assumem que remover FKs órfãs resolve o bloqueio, mas não há teste contra cadeias de FK órfãs mais profundas (múltiplas execuções incompletas anteriores deixando FKs cruzadas) (`migracao-de-tabelas/design.md`, Riscos e Lacunas).
**Spec afetada:** [`migracao-de-tabelas/design.md`](migracao-de-tabelas/design.md), [`migracao-de-tabelas/tasks.md`](migracao-de-tabelas/tasks.md)
**Pergunta:** Você já teve (ou espera ter) cenários de re-execução com schemas "sujos" de tentativas anteriores incompletas? Isso mudaria a prioridade do teste TT-03.
**Impacto:** Se for um cenário real esperado, a reimplementação deveria priorizar um teste dedicado a cadeias profundas de FK órfã antes de considerar o componente equivalente ao legado.

**Resposta:** Não, não é um cenário esperado. → Lacuna permanece 🔴, mas rebaixada de prioridade em `design.md`/`tasks.md`.

### Pergunta 4 — ✅ Respondida

**Contexto:** Uma FK marcada `FK_NOT_RESTORED` (por ter duplicatas na coluna referenciada no momento da restauração) nunca é retentada automaticamente — o script não expõe um modo de "retry restauração de FK" isolado (`migracao-de-tabelas/design.md`, Riscos e Lacunas).
**Spec afetada:** [`migracao-de-tabelas/tasks.md`](migracao-de-tabelas/tasks.md)
**Pergunta:** Vale a pena a reimplementação expor um comando/modo separado para retentar restauração de FK depois que o operador limpar as duplicatas manualmente? Ou isso é aceitável como processo manual (o operador roda os `ALTER`s à mão)?
**Impacto:** Se sim, isso vira um requisito funcional novo (fora do escopo original do legado) a ser adicionado em `requirements.md`.

**Resposta:** Não, processo manual basta. → Decisão registrada em `tasks.md`, sem requisito novo.

### Pergunta 5 — ✅ Respondida

**Contexto:** Falha isolada num `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` (de `tables.column_defaults`) gera apenas um `warn()` de terminal — sem `Issue` estruturada nem campo de erro no dict de resultado, então não aparece em `report.json`/`report.html` (`migracao-de-tabelas/design.md`, Riscos e Lacunas).
**Spec afetada:** [`migracao-de-tabelas/requirements.md`](migracao-de-tabelas/requirements.md), [`relatorios-de-migracao/requirements.md`](relatorios-de-migracao/requirements.md)
**Pergunta:** Essa falha deveria virar uma `Issue` de severidade `warning` visível no relatório final, na reimplementação? Hoje ela só é vista se o operador estiver acompanhando o terminal ao vivo.
**Impacto:** Se sim, um requisito novo (ex: `COLUMN_DEFAULT_FAILED`) deve ser adicionado à unit e ao dicionário de dados (`data-dictionary.md`).

**Resposta:** Sim, deveria gerar Issue visível. → Adicionado RF-10 em `migracao-de-tabelas/requirements.md`, código `COLUMN_DEFAULT_FAILED` em `data-dictionary.md`, e ajustado T-07 em `tasks.md`.

---

## Bloco C — `arquivo-de-configuracao`

### Pergunta 6 — ✅ Respondida

**Contexto:** `--config` não valida schema — uma chave grafada errada (ex: `tables.forceinnodb`) ou um tipo incompatível (ex: string onde se espera lista) falha silenciosamente, sem aviso de "chave desconhecida" (`arquivo-de-configuracao/design.md`, Riscos e Lacunas).
**Spec afetada:** [`arquivo-de-configuracao/requirements.md`](arquivo-de-configuracao/requirements.md), [`arquivo-de-configuracao/tasks.md`](arquivo-de-configuracao/tasks.md)
**Pergunta:** Ao reimplementar, vale introduzir validação de schema (ex: Pydantic/JSON Schema) que avise sobre chaves desconhecidas/tipos incompatíveis? Ou o fallback silencioso atual é um comportamento a preservar deliberadamente (simplicidade)?
**Impacto:** Muda diretamente o RF-02/RF-03 de `requirements.md` e a prioridade MoSCoW da unit se a resposta for "sim, adicionar validação".

**Resposta:** Manter o comportamento atual (sem validação), mas documentar o risco na saída (`--init-config`). → RF-05 atualizado em `requirements.md`, T-05 atualizado em `tasks.md` para exigir o aviso no template gerado.

---

## Bloco D — `relatorios-de-migracao`

### Pergunta 7 — ✅ Respondida

**Contexto:** Não há teste automatizado que confirme que `migration.sql` gerado é sempre executável do início ao fim sem edição manual (ex: possível ordem de dependência entre tabelas com FK cruzada que não segue a ordem de criação original) (`relatorios-de-migracao/design.md`, Riscos e Lacunas).
**Spec afetada:** [`relatorios-de-migracao/tasks.md`](relatorios-de-migracao/tasks.md)
**Pergunta:** Você já tentou reexecutar um `migration.sql` gerado contra um banco limpo? Funcionou de ponta a ponta, ou precisou de edição manual (ex: reordenar tabelas por causa de FK)?
**Impacto:** Se já houve necessidade de edição manual, isso é uma lacuna 🔴 confirmada que deveria virar requisito de ordenação topológica na reimplementação, não apenas "tabelas antes de rotinas".

**Resposta:** Não testei/não sei. → Lacuna permanece 🔴, sem alteração de prioridade.

### Pergunta 8 — ✅ Respondida

**Contexto:** `report.json`, `report.html` e `migration.sql` são montados por três funções de renderização independentes a partir do mesmo `report_data`, sem um serializador único — mudanças futuras precisam ser replicadas manualmente nas três (`relatorios-de-migracao/decisions.md`, ADR-0004).
**Spec afetada:** [`relatorios-de-migracao/design.md`](relatorios-de-migracao/design.md)
**Pergunta:** Na reimplementação, vale consolidar os três formatos sob um template/serializador único (reduzindo risco de divergência), ou prefere manter a simplicidade de três funções independentes como no legado?
**Impacto:** Decisão arquitetural que afeta diretamente o design da unit `relatorios-de-migracao` na reimplementação — não é um bug do legado, é uma escolha de trade-off.

**Resposta:** Consolidar em serializador único. → Registrado como Adendo 2 em `decisions.md` (ADR-0004) e novo item em `tasks.md`.

### Pergunta 9 — ✅ Respondida

**Contexto:** `report.json` não registra usuário do SO nem usuário MySQL usado na migração — não há trilha de "quem rodou" (`permissions.md`, Lacunas).
**Spec afetada:** [`relatorios-de-migracao/requirements.md`](relatorios-de-migracao/requirements.md)
**Pergunta:** Isso é relevante para o seu caso de uso (auditoria/compliance), ou é aceitável que o relatório não registre identidade do operador?
**Impacto:** Se relevante, vira um novo campo em `report_data` (`data-dictionary.md`) e um requisito funcional novo.

**Resposta:** Não é relevante. → Lacuna fechada em `permissions.md`, sem requisito novo.

---

## Bloco E — `correcao-de-collation`

### Pergunta 10 — ✅ Respondida

**Contexto:** Em `recreate_routine`, se o `DROP` for commitado mas o `CREATE` subsequente falhar, a rotina original fica **removida do banco** até correção manual — não há backup do DDL antes do `DROP` nem tentativa automática de restaurar (`correcao-de-collation/design.md`, Riscos e Lacunas).
**Spec afetada:** [`correcao-de-collation/tasks.md`](correcao-de-collation/tasks.md)
**Pergunta:** Esse risco é aceitável como está (mitigado pelo `recreated.sql`/`retry_errors.sql` gerados como log, permitindo recriação manual), ou a reimplementação deveria usar uma transação única/atômica para `DROP`+`CREATE`, ou fazer backup do DDL antes do `DROP`?
**Impacto:** Se decidido que não é aceitável, vira um requisito de segurança (Must) na reimplementação desta unit, com impacto direto no design de `recreate_routine`.

**Resposta:** Não, precisa de salvaguarda. → Novo RF-09 (Must) em `requirements.md`, T-09 atualizado em `tasks.md` com exigência de transação atômica ou backup+restauração automática do DDL.

---

## Bloco F — Geral / Domínio

### Pergunta 11 — ✅ Respondida

**Contexto:** Alguns critérios de severidade de `Issue` parecem arbitrários sem confirmação do autor original — ex: `GROUP_CONCAT` sem limite é só `warning`, sem checar o `group_concat_max_len` real do servidor de destino (`domain.md`, Lacunas).
**Spec afetada:** [`migracao-de-rotinas/requirements.md`](migracao-de-rotinas/requirements.md)
**Pergunta:** O critério atual (severidade fixa por tipo de padrão, sem inspecionar o servidor de destino) é intencional/aceitável, ou a reimplementação deveria consultar o valor real de `group_concat_max_len` do destino antes de decidir a severidade?
**Impacto:** Se a segunda opção for a esperada, isso muda o contrato de `fix_group_concat_maxlen` (deixa de ser uma função pura `(ddl) -> (ddl, Issue)` e passa a depender de uma consulta ao servidor de destino).

**Resposta:** Aceitável como está. → Lacuna fechada em `domain.md`, comportamento confirmado como intencional, sem mudança de contrato.

### Pergunta 12 — ✅ Respondida

**Contexto:** `.env.example` no repositório contém valores que se parecem com credenciais reais de rede interna (já sinalizado em `inventory.md` e `domain.md`, Lacunas).
**Spec afetada:** [`domain.md`](domain.md)
**Pergunta:** Você pode confirmar se esses valores em `.env.example` são exemplo fictício (coincidência de formato) ou se é um vazamento acidental de credenciais reais que precisa ser rotacionado/removido do histórico do Git?
**Impacto:** Se for vazamento real, é uma ação de segurança urgente e fora do escopo de documentação (rotacionar credenciais, limpar histórico do Git) — não apenas uma nota na spec.

**Resposta:** Pode ser ignorado — na prática a conexão acontece de forma interativa quando a aplicação é executada, o conteúdo de `.env.example` não é usado para conectar de fato.
