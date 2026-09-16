---
schemaVersion: 1
generatedAt: 2026-09-15T20:45:00Z
reversa:
  version: "1.3.3"
kind: target_domain_model
producedBy: designer
hash: "sha256:7fdeada0e19e7fe88bbe5ad17342df5354d721d1a6dc9b2079b3423464aadc36"
---

# Target Domain Model

> Modelo de domínio do sistema novo. Rastreabilidade explícita para o legado (`_reversa_sdd/domain.md`, `data-dictionary.md`).
> Coerente com a decisão híbrida de topologia/paradigma: os "aggregates" abaixo são estruturas de dados simples (DTOs) com validação, não entidades ricas com comportamento encapsulado — evitando DDD pesado, conforme `topology_decision.md` § Implicações pendentes.

## Aggregates

### AGG-MigrationJob
- **Aggregate root**: MigrationJob
- **Invariantes**:
  - Um job pertence a exatamente uma feature (`routines` | `tables` | `config` | `reports` | `collation-fix`) e a um par de conexões (origem/destino, ou única no caso de `collation-fix`).
  - Um job não pode ser marcado `applied`/`completed` sem que todos os seus itens (`JobItem`) tenham um status terminal (`applied` | `skipped` | `error`) — equivalente ao invariante implícito do legado onde `routine_results`/`table_results` só eram exibidos no resumo final depois do loop de `main()` terminar.
  - Falha num `JobItem` não muda o status do `MigrationJob` para falho — preserva BR-MIGRAR-003 (falha isolada não aborta o lote).
- **Comandos aceitos**: `iniciar`, `cancelar` (antes de terminar), `consultar progresso`.
- **Eventos publicados**: nenhum (paradigma híbrido — sem eventos de domínio, ver `target_architecture.md` § Honra ao paradigma escolhido).
- **Origem no legado**: não existe equivalente persistido — no legado, o estado de uma execução vivia apenas na memória de `main()` (`routine_results`/`table_results` como `list[dict]`) e era descartado ao final, exceto pelo que ia para `report.json`. **Novo**.

### AGG-ConnectionProfile
- **Aggregate root**: ConnectionProfile
- **Invariantes**:
  - Senha nunca é retornada em texto claro por nenhuma consulta/API — preserva BR-MIGRAR-015 diretamente.
  - Um perfil tem host/port/user/senha-cifrada/database, com port default 3306 (BR-MIGRAR-014).
- **Comandos aceitos**: `criar`, `atualizar`, `remover`, `usar em um job` (nunca "ler senha").
- **Eventos publicados**: nenhum.
- **Origem no legado**: não existe — o legado nunca persistia credenciais (pedia a cada execução via `--config`/prompt, ou `.env` local). **Novo** (BR-HUMANA-002).

## Entidades

| Entidade | Aggregate dono | Atributos principais | Origem no legado |
|---|---|---|---|
| `JobItem` (rotina) | AGG-MigrationJob | `name`, `type`, `definer`, `applied`, `skipped`, `issues: Issue[]`, `ddlOriginal`, `ddlFixed`, `applyError`, `extractError` | 1-para-1 com o dict de `routine_results` (`data-dictionary.md` § "Resultado de rotina") |
| `JobItem` (tabela) | AGG-MigrationJob | `name`, `engine`, `approxRows`, `mode`, `applied`, `skipped`, `issues: Issue[]`, `ddlOriginal`, `ddlFixed`, `applyError`, `rowsCopied`, `copyError` | 1-para-1 com o dict de `table_results` (`data-dictionary.md` § "Resultado de tabela") |
| `FkSpec` | AGG-MigrationJob (via `JobItem` de tabela) | `fkName`, `childTable`, `childCols`, `refTable`, `refCols`, `extra` | 1-para-1 com `fk_specs` (`data-dictionary.md` § "fk_specs") |
| `CollationFixResult` | AGG-MigrationJob (feature `collation-fix`) | `name`, `type`, `success`, `ddl`, `error` | 1-para-1 com o dict de `results` de `fix_collation_stamp.py:426-432` |

## Value objects

| Value object | Atributos | Validações | Origem |
|---|---|---|---|
| `Issue` | `code`, `severity` (`error`\|`warning`\|`info`), `description`, `original`, `fixed` | `severity` restrito ao enum; `code` de um conjunto fechado (ver `data-dictionary.md` § "Códigos de issue conhecidos", agora incluindo `COLUMN_DEFAULT_FAILED` — BR-MIGRAR-011) | 1-para-1 com a classe `Issue` do legado (`migrate_routines.py:425`) — imutável no novo modelo, ao contrário do legado onde era uma classe mutável com `__init__` manual |
| `ColumnDefault` | `table`, `column`, `value` (literal ou `"hoje"`/`"today"`) | valor resolvido via a mesma lógica de `_resolve_default_value` (BR-MIGRAR-008) | 1-para-1 com `tables.column_defaults` do `CONFIG` legado |
| `TableFilter` | `table`, `whereClause` | nenhuma validação SQL adicional (mesma superfície de risco do legado — interpolação de string, aceitável pois a fonte é o operador autenticado, não input de terceiros, ver ADR-0006) | 1-para-1 com `table_filters` do legado |

## Eventos de domínio

Não aplicável — o paradigma alvo escolhido é híbrido/balanced, sem arquitetura orientada a eventos (`paradigm_decision.md` § Decisão do usuário; `target_architecture.md` § Honra ao paradigma escolhido). O `MigrationJob` muda de estado internamente (rastreado no App DB), mas essas transições não são publicadas como eventos de domínio para outros contextos consumirem.

## Regras de domínio

| Regra (ID) | Local no domínio novo | Origem (target_business_rules.md) |
|---|---|---|
| BR-MIGRAR-001 | `features/routines` — transformação de DDL, aplicada antes de `AGG-MigrationJob` marcar `JobItem` como aplicado | BR-MIGRAR-001 |
| BR-MIGRAR-002 | `features/routines` — pipeline de 8 transformações puras, mesma assinatura `(ddl) -> (ddl, Issue)` | BR-MIGRAR-002 |
| BR-MIGRAR-003 | `AGG-MigrationJob` — invariante "falha de item não aborta o job" | BR-MIGRAR-003 |
| BR-MIGRAR-006 | `features/tables` — FK Recovery Engine, produz `FkSpec` pendentes anexados ao `JobItem` | BR-MIGRAR-006 |
| BR-MIGRAR-008 | `features/tables` — `ColumnDefault` aplicado em dois lugares (schema + substituição em memória) | BR-MIGRAR-008 |
| BR-MIGRAR-011 | `Issue` — novo código `COLUMN_DEFAULT_FAILED` | BR-MIGRAR-011 (RF-10) |
| BR-MIGRAR-015 | `AGG-ConnectionProfile` — invariante "senha nunca em claro" | BR-MIGRAR-015 |
| BR-MIGRAR-016 | `features/reports` — serializador único consumindo `AGG-MigrationJob` completo | BR-MIGRAR-016 |
| BR-MIGRAR-021 | `features/collation-fix` — salvaguarda transacional em `CollationFixResult` | BR-MIGRAR-021 (RF-09) |

## Rastreabilidade para o legado

| Elemento novo | Origem no legado | Tipo de mapeamento |
|---|---|---|
| `Issue` (value object) | `migrate_routines.py:425` (classe `Issue`) | 1-para-1 (imutável no novo, mutável no legado) |
| `JobItem` (rotina) | `routine_results` (dict) | 1-para-1 |
| `JobItem` (tabela) | `table_results` (dict) | 1-para-1 |
| `FkSpec` | `fk_specs` (dict) | 1-para-1 |
| `CollationFixResult` | `results` de `fix_collation_stamp.py` | 1-para-1 |
| `ColumnDefault`, `TableFilter` | `tables.column_defaults`/`table_filters` do `CONFIG` | 1-para-1 |
| `AGG-MigrationJob` | (nenhum) | novo |
| `AGG-ConnectionProfile` | (nenhum) | novo |

## Notas

Deliberadamente, nenhum aggregate publica eventos, nenhuma entidade tem métodos de negócio complexos além de validação simples — o "domínio" aqui é majoritariamente DTOs bem tipados espelhando as estruturas de dict já documentadas em `data-dictionary.md`, com a lógica de negócio real vivendo em funções puras dentro de cada `features/<slice>` (não em métodos de aggregate). Isso é intencional e reflete tanto a decisão de paradigma híbrido quanto a de topologia híbrida — modelar como DDD rico aqui seria decomposição por modismo, não por necessidade (regra absoluta do Designer).
