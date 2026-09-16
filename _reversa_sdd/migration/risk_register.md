---
schemaVersion: 1
generatedAt: 2026-09-15T20:00:00Z
reversa:
  version: "1.3.3"
kind: risk_register
producedBy: strategist
hash: "sha256:04e47f5fbb99b64afbd6c63dc9bfe2d5be65d5693d841b6295dc151bb6bcc5fa"
---

# Risk Register

> Registro de riscos da migração com probabilidade, impacto, mitigação e responsável.

## Riscos

### RISK-001
- **Descrição**: a reimplementação da recuperação automática de foreign keys (BR-MIGRAR-006, o núcleo de negócio mais complexo do projeto) diverge sutilmente do comportamento do legado, deixando FKs órfãs não detectadas ou restaurando FKs incorretamente.
- **Categoria**: técnico
- **Probabilidade**: média
- **Impacto**: crítico
- **Severidade combinada**: crítica
- **Trigger / sinal de alerta**: no Parallel Run (Estratégia B), o schema resultante da web diverge do resultado do CLI legado para a mesma tabela de teste.
- **Mitigação**: Parallel Run obrigatório para `migracao-de-tabelas` antes de tornar a web a ferramenta primária para essa feature (ver `migration_strategy.md`); cobrir com testes automatizados os cenários já documentados em `migracao-de-tabelas/tasks.md` (TT-01 a TT-08).
- **Plano de contingência**: manter o CLI legado disponível e documentado como fallback até o Parallel Run acumular confiança suficiente (critério objetivo a definir em `cutover_plan.md`).
- **Owner**: agente de codificação / responsável técnico da migração.
- **Status**: aberto

### RISK-002
- **Descrição**: alguma tabela ou procedure/function não chega íntegra ao destino — este é o próprio fator de risco #1 declarado pelo operador no brief.
- **Categoria**: técnico
- **Probabilidade**: média
- **Impacto**: crítico
- **Severidade combinada**: crítica
- **Trigger / sinal de alerta**: contagem de linhas copiadas (`rows_copied`) ou de rotinas aplicadas divergindo do esperado; erro silencioso não capturado nos relatórios.
- **Mitigação**: preservar integralmente as regras de robustez já validadas (BR-MIGRAR-003, BR-MIGRAR-011, BR-MIGRAR-017, BR-MIGRAR-021) — nenhuma delas foi descartada por mudança de paradigma; Parallel Run para as duas features de maior risco.
- **Plano de contingência**: `retry_tables.sql`/`retry_routines.sql` (BR-MIGRAR-018) continuam sendo gerados na versão web para reprocessamento manual de itens com erro.
- **Owner**: agente de codificação.
- **Status**: aberto

### RISK-003
- **Descrição**: a reimplementação do fluxo de decisão (wizard multi-step, BR-HUMANA-001 resolvida) introduz um bug de sequenciamento onde o job assíncrono é disparado com parâmetros de uma etapa anterior não confirmada, ou o preview mostrado não reflete exatamente o que será aplicado.
- **Categoria**: técnico
- **Probabilidade**: média
- **Impacto**: alto
- **Severidade combinada**: alta
- **Trigger / sinal de alerta**: divergência entre o preview de compatibilidade mostrado ao operador e o resultado real da aplicação.
- **Mitigação**: o endpoint de dry-run/preview deve reutilizar exatamente a mesma lógica de transformação usada pelo job de aplicação real (mesma função, não uma duplicata) — nota já registrada em `ambiguity_log.md` § Referidos à Codificação.
- **Plano de contingência**: revisão manual do relatório final antes de confiar cegamente no preview, até o wizard acumular uso comprovado.
- **Owner**: agente de codificação.
- **Status**: aberto

### RISK-004
- **Descrição**: o mecanismo de "job em background" (decisão híbrida de paradigma) não tem uma forma robusta de recuperação se o processo do servidor cair no meio de uma migração longa (ex: cópia de dados de uma tabela grande em lotes de 500 linhas).
- **Categoria**: técnico
- **Probabilidade**: baixa
- **Impacto**: alto
- **Severidade combinada**: média
- **Trigger / sinal de alerta**: job marcado como "em progresso" indefinidamente após reinício do servidor, sem possibilidade de retomar ou saber o que já foi aplicado.
- **Mitigação**: como o pipeline interno permanece sequencial (decisão híbrida), garantir que o estado de progresso (quais tabelas/rotinas já foram processadas) seja persistido incrementalmente — o mesmo padrão de `routine_results`/`table_results` do legado, mas gravado em banco/disco a cada item, não só ao final.
- **Plano de contingência**: o operador pode consultar `report.json` parcial (se persistido incrementalmente) para saber onde parou e usar o CLI legado para concluir manualmente, se necessário.
- **Owner**: Designer (arquitetura do job runner) / agente de codificação.
- **Status**: aberto

### RISK-005
- **Descrição**: o cofre de credenciais (BR-HUMANA-002 resolvida) introduz uma superfície de ataque nova que não existia no legado (onde a senha nunca era persistida, só digitada por sessão de terminal).
- **Categoria**: técnico
- **Probabilidade**: baixa
- **Impacto**: alto
- **Severidade combinada**: média
- **Trigger / sinal de alerta**: qualquer vazamento de dados do cofre (ex: dump de banco da aplicação web) exporia credenciais de múltiplos bancos MySQL, algo que o legado nunca centralizava.
- **Mitigação**: cifrar em repouso com chave gerenciada fora do banco da aplicação (ex: variável de ambiente/secret manager da VM interna); nunca logar a senha, mesmo mascarada parcialmente (preservando BR-MIGRAR-015).
- **Plano de contingência**: procedimento de rotação de credenciais documentado, dado que agora existe um ponto único de armazenamento.
- **Owner**: Área de Infraestrutura (stakeholder declarado no brief).
- **Status**: aberto

### RISK-006
- **Descrição**: falta de clareza operacional sobre qual ferramenta (CLI legado ou web parcial) usar para qual feature, durante o período de coexistência da Estratégia A (Strangler Fig).
- **Categoria**: organizacional
- **Probabilidade**: média
- **Impacto**: médio
- **Severidade combinada**: média
- **Trigger / sinal de alerta**: operador usa a ferramenta errada para uma feature ainda não migrada, ou duplica trabalho.
- **Mitigação**: comunicação explícita à Área de Infraestrutura (stakeholder único do brief) sobre qual feature está disponível na web em cada momento; considerar um indicador simples no próprio CLI legado avisando "essa feature já está disponível na versão web" conforme cada uma for concluída.
- **Plano de contingência**: nenhuma ação corretiva além de reforçar a comunicação — risco de baixo custo de correção.
- **Owner**: Área de Infraestrutura.
- **Status**: aberto

### RISK-007
- **Descrição**: ausência de prazo e orçamento definidos no `migration_brief.md` dificulta priorizar entre as 5 features durante a Estratégia A (Strangler Fig) — sem prazo, a ordem de entrega pode se estender indefinidamente.
- **Categoria**: organizacional
- **Probabilidade**: média
- **Impacto**: médio
- **Severidade combinada**: média
- **Trigger / sinal de alerta**: nenhuma feature nova entregue na web por um período longo sem justificativa técnica.
- **Mitigação**: recomendar à Área de Infraestrutura definir uma ordem de prioridade explícita entre as 5 features (sugestão: `migracao-de-tabelas` e `migracao-de-rotinas` primeiro, por serem o núcleo de negócio e onde o Parallel Run já está planejado).
- **Plano de contingência**: nenhum formal — é uma lacuna de planejamento, não um risco técnico.
- **Owner**: Área de Infraestrutura.
- **Status**: aberto

### RISK-008
- **Descrição**: o time de codificação pode não ter familiaridade equivalente com o domínio de migração MySQL 5→8 (recuperação de FK, transformações de DDL) que o autor do script legado tinha — risco de introduzir regressões sutis ao portar regras de negócio complexas.
- **Categoria**: organizacional
- **Probabilidade**: média
- **Impacto**: alto
- **Severidade combinada**: alta
- **Trigger / sinal de alerta**: dúvidas recorrentes sobre o "porquê" de uma regra durante a implementação, não respondidas pelas specs.
- **Mitigação**: `handoff.md` e as specs completas em `_reversa_sdd/` (incluindo ADRs e `domain.md`) são a base de conhecimento; `target_business_rules.md` já traduz cada regra com origem rastreável.
- **Plano de contingência**: nenhum além de consulta às specs — risco inerente a qualquer reimplementação por equipe diferente do autor original.
- **Owner**: agente de codificação.
- **Status**: aberto

## Resumo por severidade

| Severidade | Quantidade | IDs |
|---|---|---|
| Crítica | 2 | RISK-001, RISK-002 |
| Alta | 2 | RISK-003, RISK-008 |
| Média | 4 | RISK-004, RISK-005, RISK-006, RISK-007 |
| Baixa | 0 | — |

## Riscos relacionados ao paradigma alvo

- **RISK-003**: risco de o preview (dry-run síncrono) divergir do job assíncrono real — surge diretamente da decisão híbrida de separar preview (síncrono) de aplicação (job em background), ver `paradigm_decision.md` implicação 3.
- **RISK-004**: risco de recuperação de job em background sem infraestrutura de fila real — surge diretamente da escolha "híbrido" (job simples, sem fila/DLQ) em vez do paradigma natural pleno (event-driven com fila), ver `paradigm_decision.md` § Notas.
