# ADR-0002 — Recuperação automática de foreign keys em duas estratégias, com restauração posterior

- **Status:** Aceito (implícito)
- **Confiança:** 🟡 INFERIDO

## Contexto

O MySQL 8 exige que a coluna referenciada por uma `FOREIGN KEY` tenha uma `UNIQUE KEY` (ou seja parte de uma) — uma exigência que schemas legados de MySQL 5 frequentemente não cumprem. Sem tratamento, isso interrompe a migração tabela a tabela sempre que uma FK "mal formada" (pelos padrões do MySQL 8) é encontrada, exigindo intervenção manual repetida do operador.

## Decisão

`apply_table` captura os erros MySQL 1215/6125 e tenta, em ordem: (1) remover a FK da própria tabela sendo criada; (2) remover FKs órfãs de *outras* tabelas que ainda apontam para esta (deixadas por execução anterior). As FKs removidas são registradas como `fk_specs` estruturados (não apenas como aviso textual) para permitir uma tentativa de restauração automática **depois** que todas as tabelas e dados já foram migrados (`resolve_pending_foreign_keys`), quando é possível checar com segurança se a coluna referenciada está livre de duplicatas.

## Consequências

- ✅ A migração de um schema inteiro não trava numa única tabela com FK problemática — prioriza completar estrutura + dados.
- ✅ Tentativa de restauração automática reduz trabalho manual do DBA nos casos "limpos" (sem duplicatas na coluna referenciada).
- ⚠️ Uma migração pode terminar "bem-sucedida" (`applied=True`) sem todas as FKs originais preservadas — ver `domain.md` e `state-machines.md`. Isso é uma escolha deliberada de trade-off (dados > integridade referencial imediata), não uma falha.
- ⚠️ A restauração de FK cria uma `UNIQUE KEY` nova na tabela pai como efeito colateral — essa constraint adicional permanece mesmo se a FK em si não puder ser restaurada depois (ver `resolve_pending_foreign_keys` em `code-analysis.md`).
