# Lacunas Remanescentes — migra_db_mysql

> Gerado pelo Revisor em 2026-09-15, na fase de Revisão (`doc_level = "completo"`).
> Lista as lacunas 🔴 que permaneceram sem resposta definitiva após o processo de validação humana em `questions.md` — todas as 12 perguntas foram respondidas, mas 4 delas não puderam ser resolvidas apenas por decisão do operador em chat, pois dependem de teste contra um MySQL real ou de artefatos que não existem hoje (DDLs de produção anonimizados).

Nenhuma destas lacunas bloqueia o início da reimplementação — todas são validações de robustez a executar durante a fase de implementação/teste, não pré-requisitos de design.

---

## `migracao-de-rotinas/`

**Lacuna:** Não há suíte de testes automatizados para as 9 transformações de DDL de rotina (`remove_definer` + 8 da lista `TRANSFORMATIONS`) contra DDLs reais de produção.

**Por que ficou sem resposta:** perguntado ao operador (`questions.md#pergunta-2`) se havia DDLs de produção anonimizados disponíveis para reaproveitar como suíte de regressão — resposta: não há.

**Ação recomendada:** a reimplementação deve construir uma suíte de testes sintética (casos de DDL escritos à mão cobrindo cada padrão detectado por cada transformação), já que não há material real disponível. Referência: `migracao-de-rotinas/tasks.md`, tarefas TT-01 a TT-05.

---

## `migracao-de-tabelas/`

**Lacuna:** Comportamento de `find_referencing_fks`/`drop_referencing_fks` contra cadeias de FK órfãs mais profundas (múltiplas execuções incompletas anteriores deixando FKs cruzadas) não está confirmado contra um MySQL real.

**Por que ficou sem resposta:** perguntado ao operador (`questions.md#pergunta-3`) se esse cenário já ocorreu ou é esperado — resposta: não é um cenário esperado. Isso reduz a prioridade da lacuna, mas não a resolve tecnicamente (o comportamento continua não testado).

**Ação recomendada:** manter como teste de baixa prioridade (TT-03 em `migracao-de-tabelas/tasks.md`) — implementar apenas se surgir evidência de que o cenário ocorre na prática.

---

## `arquivo-de-configuracao/`

**Lacuna:** Comportamento exato quando uma chave do `--config` recebe um tipo de dado incompatível (ex: string onde se espera lista) não está confirmado — pode causar exceção não tratada em algum ponto downstream específico, ou todos os usos podem já ser suficientemente defensivos.

**Por que ficou sem resposta:** não foi levantada diretamente ao operador como pergunta de decisão (é uma lacuna de comportamento, não de política) — depende de teste dedicado contra o código real, não de uma escolha do operador.

**Ação recomendada:** cobrir com testes dedicados (TT-01 a TT-05 de `arquivo-de-configuracao/tasks.md`) antes de considerar a reimplementação equivalente ao original nesse ponto.

---

## `relatorios-de-migracao/`

**Lacuna:** Não há confirmação de que `migration.sql` gerado é sempre executável do início ao fim sem edição manual (ex: possível ordem de dependência entre tabelas com FK cruzada que não segue a ordem de criação original).

**Por que ficou sem resposta:** perguntado ao operador (`questions.md#pergunta-7`) se já tentou reexecutar um `migration.sql` gerado contra um banco limpo — resposta: não testou/não sabe.

**Ação recomendada:** é a lacuna de maior risco prático remanescente (afeta um artefato pensado para recuperação de desastre) — a reimplementação deveria incluir um teste automatizado de reexecução contra um banco limpo antes de considerar o artefato confiável (TT-05 em `relatorios-de-migracao/tasks.md`).
