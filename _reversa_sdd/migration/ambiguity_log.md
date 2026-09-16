---
schemaVersion: 1
generatedAt: 2026-09-15T19:40:00Z
reversa:
  version: "1.3.3"
kind: ambiguity_log
producedBy: orchestrator
hash: "sha256:448bb7bffc35449b5f97af13d2e7870d36301f74b9b5fd3499664edbd7fd03b0"
---

# Ambiguity Log

> Consolidação de itens em aberto, decisões humanas pendentes/resolvidas, e itens referidos à codificação, ao longo de todo o pipeline do Time de Migração.

## PENDENTES

Nenhuma. Os 3 itens que estavam aqui (BR-HUMANA-001/002/003) foram resolvidos pelo operador em 2026-09-15 — ver seção seguinte.

## RESOLVIDOS COM DECISÃO HUMANA

Itens que já passaram por decisão do operador durante este pipeline (Reversa + Time de Migração).

| ID / Tema | Decisão | Origem |
|---|---|---|
| Paradigma alvo | Híbrido/balanced — pipeline interno permanece sequencial, exposto via job assíncrono simples, sem arquitetura de eventos plena | `paradigm_decision.md` |
| Stack alvo | Node.js/TypeScript (Fastify ou NestJS) | `migration_brief.md` |
| Branch de trabalho | `migracao-web-stack`, isolada de `main`, para não comprometer a versão CLI atual | Pedido do operador nesta sessão |
| BR-HUMANA-001 — Fluxo de decisão da web | Wizard multi-step com preview (não formulário único) | `target_business_rules.md` |
| BR-HUMANA-002 — Credenciais MySQL | Cofre de credenciais com senha cifrada em repouso | `target_business_rules.md` |
| BR-HUMANA-003 — Collation parametrizável | Parametrizar via formulário (não manter fixo) | `target_business_rules.md` |
| Erro de privilégio insuficiente (rotinas) | Confirmado funcionando corretamente em uso real | `_reversa_sdd/questions.md#pergunta-1` |
| Suíte de testes de transformação de DDL | Sem DDLs de produção disponíveis — suíte será sintética | `_reversa_sdd/questions.md#pergunta-2` |
| Cadeias de FK órfã profundas | Não é cenário esperado — prioridade de teste rebaixada | `_reversa_sdd/questions.md#pergunta-3` |
| Retry de FK `FK_NOT_RESTORED` | Processo manual é suficiente — sem modo de retry dedicado | `_reversa_sdd/questions.md#pergunta-4` |
| Falha de `SET DEFAULT` sem `Issue` visível | Deve virar `Issue` `COLUMN_DEFAULT_FAILED` — novo RF-10 | `_reversa_sdd/questions.md#pergunta-5` |
| Validação de schema do `--config` | Manter fallback silencioso, mas documentar o risco na saída | `_reversa_sdd/questions.md#pergunta-6` |
| Reexecução de `migration.sql` | Não testado pelo operador — lacuna permanece aberta | `_reversa_sdd/questions.md#pergunta-7` |
| Arquitetura dos 3 formatos de relatório | Consolidar sob serializador único na reimplementação | `_reversa_sdd/questions.md#pergunta-8` |
| Auditoria de "quem rodou a migração" | Não relevante — sem requisito novo | `_reversa_sdd/questions.md#pergunta-9` |
| Perda de rotina em `DROP`+`CREATE` falho | Inaceitável — novo RF-09 (Must), salvaguarda obrigatória | `_reversa_sdd/questions.md#pergunta-10` |
| Severidade fixa de `GROUP_CONCAT` | Confirmado como intencional, sem mudança de contrato | `_reversa_sdd/questions.md#pergunta-11` |
| `.env.example` com aparência de credencial real | Sem risco — conexão real é sempre interativa, não usa esse arquivo | `_reversa_sdd/questions.md#pergunta-12` |

## Agentes pulados (skipped)

| Agente | Motivo | Origem |
|---|---|---|
| Screen Translator | Legado é ferramenta CLI batch/interativa por terminal, sem nenhuma tela gráfica — 0 telas detectadas em `inventory.md`. Rodou em modo `skipped`, sem pausa humana (conforme `references/adapter-pairs.md` § EC-16 da própria skill). | `screen_modernization_decision.md` |

## REFERIDOS À CODIFICAÇÃO

Itens que não exigem mais decisão de produto, apenas atenção do agente de codificação durante a implementação.

| ID | Item | Nota para o agente de codificação |
|---|---|---|
| BR-MIGRAR-005 | Preview de compatibilidade | Implementar como endpoint de dry-run síncrono, separado do job de aplicação assíncrono |
| BR-MIGRAR-006 | Ordem tabelas → FKs pendentes → rotinas | Rastrear como estado explícito do job (não mais "fim de um `for`"), ver `paradigm_decision.md` implicação 2 |
| BR-MIGRAR-013 | Config sem validação de schema | Expor aviso claro na UI sobre chaves/campos não reconhecidos, já que não haverá validação rígida |
| BR-MIGRAR-016 | Relatório em 3 formatos | Consolidar sob um serializador único a partir de uma única estrutura de dados (não replicar as 3 funções independentes do legado) |
| Gaps técnicos remanescentes | `_reversa_sdd/gaps.md` (4 itens) | Cobrir com testes dedicados durante a implementação: suíte de DDL sintética, cadeia de FK órfã (baixa prioridade), tipo de dado incompatível no config, reexecução de `migration.sql` |

## Resumo

- PENDENTES: 0
- RESOLVIDOS COM DECISÃO HUMANA: 17
- REFERIDOS À CODIFICAÇÃO: 5
