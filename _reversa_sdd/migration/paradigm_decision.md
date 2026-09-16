---
schemaVersion: 1
generatedAt: 2026-09-15T19:15:00Z
reversa:
  version: "1.3.3"
kind: paradigm_decision
producedBy: paradigm_advisor
hash: "sha256:c6699b5969ff349e247ccd657c753d3f473a2ebce863895e604a437054d065e1"
---

# Paradigm Decision

> Decisão consciente sobre como tratar a mudança (ou ausência) de paradigma entre o legado e a stack alvo.
> Este artefato é leitura obrigatória primeiro para qualquer agente posterior e para o agente de codificação.

## Paradigma do legado detectado
- **Paradigma principal**: procedural
- **Confiança**: 🟢 CONFIRMADO
- **Evidências**:
  - `code-analysis.md:72-74` — única classe do projeto inteiro (`Issue`) é um contêiner de dados sem comportamento (`__init__` manual, sem métodos); todo o resto é funções top-level.
  - `architecture.md` — descreve o sistema como uma sequência de funções puras `(ddl) -> (ddl, Issue|None)` compondo um pipeline (`TRANSFORMATIONS`/`TABLE_TRANSFORMATIONS`), sem aggregates, interfaces de repositório ou injeção de dependência.
  - `domain.md` — não há entidade de domínio persistida com identidade própria; o "ciclo de vida de um item de migração" é observado via campos de dict (`applied`/`skipped`/`apply_error`), não uma classe de domínio (ver `state-machines.md`).
  - `main()` em ambos os scripts é um fluxo linear, sequencial, com side effects abertos (conexões MySQL, `print`/`input`), sem abstração de camadas.
- **Variações observadas**: nenhuma — `migrate_routines.py` e `fix_collation_stamp.py` seguem o mesmo estilo procedural, de forma consistente (inclusive duplicando helpers ao invés de compartilhar via classe/módulo comum — ver ADR-0005).

## Stack alvo declarada
- Linguagem: Node.js / TypeScript
- Framework: Fastify ou NestJS (a decidir pelo Strategist/Designer)
- Infra: VM interna, acessível via VPN, sem exposição à internet

## Paradigma natural inferido
- **Paradigma**: event-driven assíncrono
- **Justificativa**: Node.js é um runtime async-first — I/O (incluindo toda comunicação com MySQL) é naturalmente não bloqueante, e o ecossistema (Fastify/NestJS, filas como BullMQ) empurra para handlers desacoplados por evento/requisição.
- **Alternativas viáveis**: OO com DI é totalmente viável em Node (especialmente com NestJS, que é DI-heavy por design) — custo: perde parte do idiomatismo assíncrono nativo se a lógica de negócio for modelada de forma síncrona dentro dos serviços.

## Gap identificado
- **Severidade**: alto (procedural síncrono → event-driven assíncrono é uma mudança fundamental de modelo mental, não sintática)
- **Implicações concretas**:
  - **Erro deixa de ser "try/except e segue pro próximo item do loop".** Hoje `apply_routine`/`apply_table` capturam falha e o `for` sequencial de `main()` passa para o próximo item. Em event-driven, cada "migrar rotina X" vira mensagem processada por handler desacoplado — falha vira retry automático + DLQ, não um `continue` de loop. Isso muda a relação de `retry_routines.sql`/`retry_tables.sql` (hoje gerados para reprocessamento manual) com o sistema novo.
  - **A ordem determinística "tabelas → resolver FKs pendentes → rotinas" vira coreografia.** O legado tem sequência rígida em `main()`: todas as tabelas primeiro, `pending_fks` acumulado, `resolve_pending_foreign_keys` só depois que o loop de tabelas termina (ADR-0002). Em arquitetura de eventos, "todas as tabelas processadas" deixa de ser um fato óbvio (fim de `for`) e vira estado agregado a rastrear explicitamente.
  - **Resposta HTTP não pode esperar a migração terminar.** Hoje o CLI entrega `report.json/html/sql` de forma síncrona, na mesma execução — cópia em lotes de 500 linhas (`BATCH_SIZE`) pode levar minutos. Numa API web, iniciar migração não pode bloquear a requisição até a última linha copiar — resposta vira "202 Accepted + id do job", progresso via polling/SSE/webhook.
  - **Idempotência deixa de ser opcional.** `apply_table`/`resolve_pending_foreign_keys` assumem execução única, sequencial, numa única conexão (`SET FOREIGN_KEY_CHECKS=0` setado uma vez). Se "aplicar tabela X" virar evento reprocessável (retry por falha transitória), a operação precisa ser idempotente — nunca foi preocupação no legado porque ele roda uma única vez, sem reentrância.

## Opções apresentadas ao usuário
1. **Adotar paradigma natural da stack** (transformacional)
   - Consequências: arquitetura de jobs/fila desde o início (ex: BullMQ + Redis); ganha escalabilidade e resiliência a falha transitória; exige repensar idempotência, rastreamento de progresso e a saga tabelas→FK→rotinas. Maior esforço inicial.
2. **Forçar paradigma similar ao legado** (conservador)
   - Consequências: API web só dispara/acompanha um processo síncrono de ponta a ponta (endpoint bloqueante ou long-polling simples sobre processo em background sem fila real); menor esforço, mas não escala para migrações simultâneas e replica a fragilidade "se cair no meio, perde tudo".
3. **Híbrido** (equilibrado)
   - Consequências: núcleo de execução (extração → transformação → aplicação → cópia de dados) permanece processo sequencial internamente, como o legado, mas exposto via job assíncrono simples (fila leve ou worker em background) — sem virar arquitetura de eventos plena. Resposta HTTP não bloqueia; lógica de negócio interna não precisa virar handlers desacoplados nem se preocupar com idempotência de reprocessamento por mensagem.

## Decisão do usuário
- **Escolha**: 3 (Híbrido)
- **Justificativa do usuário**: Ferramenta de uso interno, acessada via VPN, sem exigência de alta concorrência de migrações simultâneas — uma arquitetura de eventos plena (fila real, handlers desacoplados, DLQ) seria over-engineering para esse volume de uso. Prioriza pragmatismo: expor o pipeline procedural existente como um job assíncrono simples, sem reescrever a lógica de negócio como coreografia de eventos.
- **Decidido em**: 2026-09-15T19:20:00Z

## Apetite derivado
- `derived_appetite`: balanced

## Implicações pendentes para próximos agentes
| Agente | Implicação | Como honrar |
|---|---|---|
| Curator | O núcleo de regras de negócio (transformações de DDL, recuperação de FK, `column_defaults`) deve ser extraído como lógica pura/sequencial, sem reescrever como handlers de evento — preservando o pipeline procedural internamente. | Ao portar `target_business_rules.md`, manter as regras descritas como funções/pipeline sequencial (não como "reação a eventos"), já que a Fase 2 do Designer vai expor isso via job assíncrono simples, não fila real. |
| Strategist | A estratégia de migração/corte não deve assumir infraestrutura de fila (BullMQ, Kafka, SQS) como pré-requisito — o "assíncrono" aqui é só desacoplamento entre requisição HTTP e execução, não arquitetura de mensageria distribuída. | Ao escrever `migration_strategy.md`, registrar explicitamente que a estratégia é "processo em background com acompanhamento via polling/SSE", não uma arquitetura orientada a eventos. |
| Designer | A arquitetura alvo deve incluir um mecanismo simples de job em background (ex: fila em memória/worker local, ou tabela de jobs no próprio MySQL/banco de app) — não uma arquitetura de mensageria plena — e um endpoint de consulta de progresso/relatório. | Em `target_architecture.md`, desenhar o componente de execução de migração como um "job runner" simples, com endpoint de status, sem introduzir Redis/Kafka/SQS a menos que uma necessidade concreta apareça depois. |
| Inspector | Validar que a paridade comportamental do legado (ex: "erro numa rotina não aborta o lote", "FK pendente é resolvida só depois de todas as tabelas") foi preservada dentro do job em background — mesmo sem fila real, a ordem determinística do legado deve ser respeitada. | Ao escrever `parity_specs.md`/testes de paridade, verificar a ordem de execução interna do job (tabelas → FKs pendentes → rotinas) e o comportamento de erro item-a-item, não apenas o contrato HTTP externo. |

## Notas
A escolha híbrida significa que o agente de codificação **não deve** introduzir infraestrutura de mensageria (filas distribuídas, brokers) só porque "Node.js é event-driven por natureza" — essa é precisamente a divergência consciente registrada aqui. O critério de revisitar essa decisão no futuro seria uma necessidade concreta de rodar múltiplas migrações simultâneas com isolamento forte de falha, o que não é o cenário atual (uso interno, operador único por execução, mesmo padrão do legado — ver `permissions.md`, "Papel Operador").
