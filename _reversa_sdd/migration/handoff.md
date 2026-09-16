---
schemaVersion: 1
generatedAt: 2026-09-15T21:20:00Z
reversa:
  version: "1.3.3"
kind: handoff
producedBy: orchestrator
hash: "sha256:8b4348d615f91d4538b8a96d0296d735a0df6520b06d03c951654ebe4fbbb6c4"
---

# Handoff para o Agente de Codificação

> Este documento é a porta de entrada para o agente de codificação que vai escrever, em Node.js/TypeScript, a versão web de `migra_db_mysql` — hoje uma ferramenta CLI Python (`migrate_routines.py` + `fix_collation_stamp.py`) para migração de bancos MySQL 5.x → 8.x.

## ⚠️ Leitura obrigatória primeiro

1. **`paradigm_decision.md`** — leitura inegociável. Paradigma legado: procedural (🟢 confirmado). Escolha do operador: **híbrido/balanced** — o pipeline interno de cada feature permanece sequencial, exposto via job assíncrono simples, **sem fila/broker externo**. Não introduza infraestrutura de mensageria "porque Node.js é event-driven por natureza" — essa tentação está explicitamente descartada neste artefato.
2. **`topology_decision.md`** — leitura inegociável. Topologia legada: monolito de script único, sem pastas. Escolha do operador: **híbrido** — vertical slices por feature (`features/routines`, `features/tables`, `features/config`, `features/reports`, `features/collation-fix`) + `core/` compartilhado, sem modelagem DDD pesada.
3. **`screen_modernization_decision.md`** — o legado não tem UI (é CLI puro). Screen Translator rodou em modo **`skipped`**. O wizard multi-step da versão web é uma interface **nova**, sem tradução de tela legada a seguir — desenhe-o a partir de `target_business_rules.md` (BR-HUMANA-001) e `target_architecture.md`.

## Ordem de leitura recomendada

1. `paradigm_decision.md`
2. `topology_decision.md`
3. `screen_modernization_decision.md` (confirma modo `skipped` — pode ler rapidamente)
4. `migration_brief.md`
5. `target_business_rules.md`
6. `discard_log.md`
7. `migration_strategy.md`
8. `target_architecture.md`
9. `target_domain_model.md`
10. `target_data_model.md`
11. `data_migration_plan.md`
12. `target_screens.md`
13. `parity_specs.md` + `parity_tests/*.feature`
14. `risk_register.md` + `cutover_plan.md`
15. `ambiguity_log.md` (consultivo — nenhum item pendente)

## Lista de artefatos produzidos

| Artefato | Produzido por | Status |
|---|---|---|
| migration_brief.md | orchestrator | criado |
| paradigm_decision.md | paradigm_advisor | criado |
| target_business_rules.md | curator | criado |
| discard_log.md | curator | criado |
| migration_strategy.md | strategist | criado |
| risk_register.md | strategist | criado |
| cutover_plan.md | strategist | criado |
| topology_decision.md | designer (Fase 1) | criado |
| target_architecture.md | designer | criado |
| target_domain_model.md | designer | criado |
| target_data_model.md | designer | criado |
| data_migration_plan.md | designer | criado |
| screen_modernization_decision.md | screen_translator (Fase 1) | criado — modo `skipped` |
| target_screens.md | screen_translator | criado — nota de "0 telas detectadas" |
| screen_deviation_log.md | screen_translator | criado — vazio |
| parity_specs.md | inspector | criado |
| parity_tests/*.feature | inspector | 6 arquivos |
| ambiguity_log.md | orchestrator | consolidado — 0 pendentes |

## Bloqueadores para começar a implementação

Nenhum. Todas as decisões humanas necessárias (paradigma, topologia, estratégia, 3 itens de `target_business_rules.md` DECISÃO HUMANA) já foram tomadas e estão registradas com rastreabilidade em `ambiguity_log.md` § RESOLVIDOS COM DECISÃO HUMANA (17 itens).

## Próximos passos para o agente de codificação

1. **Ler `paradigm_decision.md` e internalizar**: paradigma alvo híbrido/balanced. Job em background simples (sem fila real); pipeline interno de cada feature permanece sequencial, igual ao legado.
2. **Ler `topology_decision.md` e internalizar**: topologia híbrida (vertical slices). Use o esboço de árvore desse artefato (`src/core/`, `src/features/<feature>/`, `src/api/`) como base literal da estrutura de pastas do novo repositório.
3. **Configurar o repositório novo** na branch `migracao-web-stack` (já criada, isolada de `main` — não commitar diretamente em `main` durante esta iniciativa). Stack: Node.js/TypeScript, framework Fastify ou NestJS (decisão final de framework específico fica a critério da implementação, dado que `migration_brief.md` deixou em aberto entre os dois).
4. **Implementar bottom-up** seguindo `target_architecture.md` e `target_domain_model.md`: `core/` (Connection Manager, cofre de credenciais, output/log, job runner) → App DB (`target_data_model.md`) → `features/tables` e `features/routines` primeiro (ordem sugerida em `risk_register.md` RISK-007 e `cutover_plan.md`, por serem onde o Parallel Run está planejado) → `features/config`, `features/reports`, `features/collation-fix` → `api/` (wizard multi-step).
5. **Portar as regras de `target_business_rules.md` § MIGRAR** como funções puras/pipeline sequencial, sem reescrever como handlers de evento (honra à decisão híbrida). As 5 regras marcadas 🆕 (BR-MIGRAR-011, BR-MIGRAR-021, e as 3 decisões humanas resolvidas) são **divergências deliberadas** do legado — implemente-as mesmo sem equivalente no código original.
6. **Não reintroduza os 5 itens de `discard_log.md`** — em especial, não implemente um "fallback para pergunta interativa no meio do job" (BR-DESCARTAR-001/002): todo parâmetro deve ser coletado no wizard antes do job iniciar.
7. **Escrever os testes a partir de `parity_specs.md` e `parity_tests/*.feature`** desde o início — critério de paridade aceita é **0 divergências estruturais** contra o CLI legado (mais rígido que uma métrica percentual, dado o risco declarado no brief).
8. **Rodar Parallel Run** (`migration_strategy.md`) para `features/tables` e `features/routines` contra pelo menos 1 banco de teste representativo, comparando resultado com o CLI legado, antes de liberar essas features para uso real (pré-requisito de `cutover_plan.md`).
9. **Seguir o cutover feature por feature** (`cutover_plan.md`) — o CLI legado permanece disponível como fallback durante toda a transição; não há pressão de "big bang".
10. **Para a migração de dados**, `data_migration_plan.md` cobre apenas a importação histórica *opcional* dos relatórios do legado — não há ETL de dados de aplicação, porque o legado nunca teve banco próprio.

## Itens auto-decididos (apenas se executado em --auto)

Não aplicável — todo o pipeline rodou em modo interativo, com todas as decisões confirmadas explicitamente pelo operador.

## Notas finais

Este é um projeto pequeno (2 scripts Python, ~2560 linhas totais) sendo transformado numa aplicação web. A tentação natural ao trabalhar em Node.js é introduzir infraestrutura de eventos/filas "porque é assim que se faz" — resista a essa tentação: a decisão consciente de `paradigm_decision.md` e `topology_decision.md` é justamente evitar esse over-engineering para o porte e o uso interno desta ferramenta. O risco real deste projeto não é arquitetural, é de **correção de dados** (RISK-001/RISK-002 em `risk_register.md`) — é ali que o esforço de teste e validação deve se concentrar, não em sofisticação de infraestrutura.
