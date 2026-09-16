---
schemaVersion: 1
generatedAt: 2026-09-15T21:10:00Z
reversa:
  version: "1.3.3"
kind: parity_specs
producedBy: inspector
hash: "sha256:e315bc44af368b949447c18d174837c5ff83573cd2f5566ba9bf5e83cb153733"
---

# Parity Specs

> Estratégia de validação de equivalência comportamental entre legado (`migrate_routines.py`/`fix_collation_stamp.py`) e o sistema novo (Node.js/TS, arquitetura em `target_architecture.md`), adaptada ao paradigma híbrido/balanced escolhido em `paradigm_decision.md`.

## Estratégia geral
- **Modos de validação aplicáveis**:
  - [ ] Shadow mode (espelhamento de tráfego com comparação assíncrona) — não aplicável: a ferramenta é invocada sob demanda por um operador, não recebe tráfego contínuo a espelhar.
  - [x] Characterization tests (suíte derivada do comportamento atual do legado) — única fonte disponível, já que não existe `_reversa_sdd/characterization_specs/` (ver § Reuso abaixo).
  - [ ] Contract tests (interfaces externas) — não aplicável: a única interface externa é o próprio MySQL, que não muda de contrato (o sistema novo é cliente do mesmo protocolo).
  - [x] Data parity (snapshots e checksums) — **crítico** para este projeto: é a estratégia de Parallel Run definida em `migration_strategy.md`, comparando o resultado da migração (schema + dados) entre CLI legado e versão web contra o mesmo banco de teste.
  - [x] Outro: **Parallel Run com diff estrutural** (não é shadow mode de tráfego — é rodar as duas ferramentas contra o mesmo banco de origem/destino de teste e comparar o resultado final).

## Critérios de "paridade aceita"
- **Métrica primária**: 0 divergências estruturais entre o schema/dados resultantes da versão web e os resultantes do CLI legado, para as mesmas entradas (mesmo banco de origem, mesma seleção de itens, mesmos parâmetros de `column_defaults`/filtros). Isso é mais rígido que uma tolerância percentual, porque o próprio operador declarou como fator de risco #1 do brief "tabela/procedure não chegar íntegra ao destino" — não há margem aceitável de divergência de dados/schema.
- **Janela de observação**: por feature — Parallel Run executado até acumular pelo menos 3 execuções sem divergência contra bancos de teste representativos, antes de a feature ser considerada apta ao cutover (`cutover_plan.md` § Pré-requisitos).
- **Critério de bloqueio**: qualquer divergência estrutural (tabela/rotina ausente, dado incompleto, FK não recuperada quando deveria) bloqueia o cutover daquela feature — não há "aceitar com ressalva" para RISK-001/RISK-002.

## Cobertura adaptada ao paradigma

> O paradigma alvo é híbrido/balanced: o pipeline interno de cada feature permanece **sequencial**, como no legado, exposto via um job em background simples — **sem fila real, sem handlers desacoplados, sem mensageria** (`paradigm_decision.md` § Decisão do usuário). Isso significa que a tabela padrão "síncrono → event-driven" do Inspector **não se aplica em toda a sua extensão** — aplicamos apenas as dimensões que a decisão híbrida efetivamente introduz.

### Dimensões aplicáveis (parcial, não a tabela completa de event-driven)
- **Idempotência de retomada de job**: como o job roda em background e pode ser interrompido por reinício do servidor (RISK-004 em `risk_register.md`), é necessário provar que retomar/reexecutar um job a partir do progresso persistido (`job_items`, ver `target_data_model.md`) não duplica efeitos (ex: não tenta recriar uma tabela já criada com sucesso, não recopia linhas já copiadas na íntegra).
- **Ordem determinística preservada**: a sequência "todas as tabelas → resolver FKs pendentes → rotinas" (implicação 2 de `paradigm_decision.md`) deve ser idêntica entre legado e novo, mesmo sendo rastreada como estado explícito em vez de inferida do fim de um `for` em memória.
- **NÃO aplicável**: ordem de mensagens entre partições, consistência eventual entre serviços, comportamento sob falha de fila/DLQ — nenhuma dessas existe nesta arquitetura, porque não há fila real (decisão consciente registrada em `paradigm_decision.md` § Notas). Cenários `@ordem`/`@idempotencia` neste documento cobrem apenas o caso de retomada de job, não coreografia distribuída.

### Equivalência funcional padrão (para tudo que não envolve a mudança de paradigma)
- Para as transformações de DDL, extração, aplicação, FK Recovery, `column_defaults` e correção de collation: mesma entrada (mesmo DDL/schema de origem) → mesma saída (mesmo DDL corrigido, mesmas `Issue`s, mesmo resultado de aplicação) → mesmo efeito observável no MySQL de destino. Estas são funções puras portadas 1:1 (BR-MIGRAR-002, BR-MIGRAR-022) — o critério de paridade aqui é o mais direto possível: comparação byte-a-byte do DDL corrigido e comparação estrutural do schema resultante.

## Tipos de teste a aplicar
- **Funcionais**: testes unitários das funções de transformação de DDL (equivalência 1:1 com os casos já documentados em `migracao-de-rotinas/tasks.md` TT-01 a TT-05 e `migracao-de-tabelas/tasks.md` TT-01 a TT-08) — ferramenta a critério do agente de codificação (ex: Vitest/Jest).
- **Contrato**: não aplicável (sem interface externa própria além do MySQL).
- **Carga / performance**: não crítico — volume baixo, uso interno; não há meta de performance declarada no brief.
- **Resiliência**: teste de retomada de job após simular término abrupto do processo no meio de uma migração de tabela grande (cobre RISK-004).

## Reuso de characterization_specs do time de descoberta
- **Origem**: `_reversa_sdd/characterization_specs/` **não existe** neste projeto — o Time de Descoberta não gerou esse artefato (não fazia parte do escopo "essencial/completo" executado). 🔴 Lacuna registrada aqui, coerente com a lacuna já existente em `_reversa_sdd/gaps.md` § `migracao-de-rotinas/` ("suíte de testes das transformações... precisa ser construída do zero").
- **Adaptações necessárias para o sistema novo**: na ausência de characterization tests prontos, os cenários Gherkin abaixo foram derivados diretamente de `_reversa_sdd/<feature>/requirements.md` (Critérios de Aceitação, já em formato Gherkin) e `target_business_rules.md` (regras MIGRAR marcadas como críticas) — não são uma tradução de testes existentes, são a primeira formalização de paridade para este projeto.

## Saídas
- `parity_tests/01-migracao-rotina-com-transformacoes.feature`
- `parity_tests/02-recuperacao-de-foreign-key.feature`
- `parity_tests/03-column-defaults-substituindo-null.feature`
- `parity_tests/04-falha-isolada-nao-aborta-lote.feature`
- `parity_tests/05-correcao-de-collation-com-salvaguarda.feature`
- `parity_tests/06-retomada-de-job-apos-falha.feature`

## Paridade de telas

Screen Translator concluiu em modo `skipped` (`screen_modernization_decision.md`) — o legado não tem UI, portanto **nenhum cenário `@paridade-visual` é gerado**. O wizard multi-step da versão web é uma interface nova sem equivalente legado a comparar; sua qualidade é validada por testes funcionais de produto, fora do escopo deste documento de paridade comportamental com o legado.

## Notas

Diferente de uma migração clássica onde "paridade" mede se o sistema novo se comporta como um serviço vivo já em produção, aqui a paridade mede se **a ferramenta nova migra bancos MySQL tão corretamente quanto a ferramenta antiga** — por isso a ênfase forte em Data Parity/Parallel Run (a estratégia já escolhida pelo operador) em vez de shadow mode ou contract tests, que não fazem sentido para este tipo de sistema.
