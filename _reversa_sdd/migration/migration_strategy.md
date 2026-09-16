---
schemaVersion: 1
generatedAt: 2026-09-15T20:00:00Z
reversa:
  version: "1.3.3"
kind: migration_strategy
producedBy: strategist
hash: "sha256:30f18500654e0d729d66ec63592bc4f8d11d511aceaf2cc968239f04d1d9dedd"
---

# Migration Strategy

> Estratégias de migração avaliadas com trade-offs explícitos. A estratégia recomendada é a sugestão do Strategist; a decisão final é humana.

## Contexto sintetizado

- **Tamanho do legado**: pequeno — 2 scripts Python (2081 + 476 linhas), 5 features documentadas (`migracao-de-rotinas`, `migracao-de-tabelas`, `arquivo-de-configuracao`, `relatorios-de-migracao`, `correcao-de-collation`), sem integrações externas além do próprio MySQL de origem/destino (`inventory.md`, `dependencies.md`).
- **Apetite derivado**: `balanced` (`paradigm_decision.md`).
- **Severidade do gap de paradigma**: alto (procedural → event-driven, mitigado pela escolha híbrida — pipeline interno permanece sequencial).
- **Restrições do brief**: prazo/orçamento não informados; uso interno via VPN, sem exposição à internet; nenhuma restrição regulatória declarada.
- **Regras de negócio críticas** (Curator): recuperação automática de foreign keys (BR-MIGRAR-006, núcleo de negócio mais complexo), `column_defaults` com `DEFAULT` real + substituição em memória (BR-MIGRAR-008), e a nova salvaguarda Must contra perda de rotina em `DROP`+`CREATE` falho (BR-MIGRAR-021/RF-09). A métrica de sucesso declarada pelo operador ("banco migrado acessível, com objetos copiados íntegros") e o risco conhecido ("tabela/procedure não chegar íntegra") tornam a **correção da migração de dados/schema** o critério mais sensível de toda a iniciativa — mais do que a interface web em si.

## Estratégias avaliadas

### Estratégia A: Strangler Fig (por feature)
- **Descrição**: a ferramenta web nasce cobrindo uma feature por vez (ex: primeiro `migracao-de-tabelas` + `migracao-de-rotinas`, depois `relatorios-de-migracao`, depois `arquivo-de-configuracao`/`correcao-de-collation`). Enquanto uma feature não está pronta na web, o operador continua usando o CLI legado para ela. Não há "tráfego" a redirecionar (não é um serviço web com usuários simultâneos) — o "roteamento" é a própria escolha do operador de qual ferramenta usar para qual tarefa, até a web cobrir 100%.
- **Quando aplica**: sistema pequeno mas com núcleo de negócio complexo (recuperação de FK) que se beneficia de validação incremental; nenhuma pressão de "não pode parar" porque a ferramenta é invocada sob demanda, não um serviço com SLA contínuo.
- **Custo**: médio. **Risco**: baixo. **Tempo**: longo (relativo ao tamanho pequeno do projeto).
- **Adequação ao apetite derivado** (`balanced`): alta — permite validar cada feature isoladamente contra o CLI legado antes de expandir, sem exigir que toda a superfície funcione perfeitamente desde o dia 1.
- **Trade-offs**:
  - Prós: risco de correção contido por feature; o operador nunca fica sem ferramenta funcional (CLI continua disponível); alinhado à decomposição em 5 features já existente na documentação.
  - Contras: mais lento para entregar o valor "tudo na web"; exige manter os dois caminhos (CLI + web parcial) coexistindo por um tempo, o que pode gerar confusão sobre qual usar para quê se não for bem comunicado.

### Estratégia B: Parallel Run (validação de paridade)
- **Descrição**: para as features de maior risco (`migracao-de-tabelas`, `migracao-de-rotinas`), a ferramenta nova roda em paralelo ao CLI legado contra os mesmos bancos de teste/staging por um período, comparando resultado (schema + dados copiados) antes de a web se tornar a ferramenta primária para essas features.
- **Quando aplica**: lógica crítica cuja correção é o principal critério de sucesso do projeto (aqui, a integridade de tabelas/procedures migradas) — não é domínio financeiro/fiscal, mas o mesmo princípio de "provar equivalência antes de confiar" se aplica.
- **Custo**: alto (exige rodar as duas ferramentas e comparar resultados manualmente ou com script de diff). **Risco**: médio. **Tempo**: médio.
- **Adequação ao apetite derivado** (`balanced`): alta — é exatamente a estratégia que o catálogo recomenda combinar com Strangler Fig para apetite `balanced`.
- **Trade-offs**:
  - Prós: dá evidência concreta de que "os objetos chegaram íntegros no destino" (a própria métrica de sucesso do brief) antes de descontinuar o CLI para uma feature; reduz risco do fator de risco #1 declarado pelo operador.
  - Contras: custo de rodar em duplicidade por um tempo; exige um ambiente de staging com dados representativos para comparar, o que não está confirmado como disponível.

### Estratégia C: Big Bang
- **Descrição**: reescrever as 5 features de uma vez na stack Node.js/TypeScript e substituir o CLI legado assim que a versão web estiver pronta, sem período de coexistência.
- **Quando aplica**: sistema pequeno, janela tolerada, apetite transformacional, poucas integrações vivas — os dois primeiros critérios batem (sistema pequeno, poucas integrações), mas o apetite aqui é `balanced`, não `transformational`, e o risco declarado pelo próprio operador é justamente sobre correção de dados.
- **Custo**: baixo. **Risco**: alto. **Tempo**: curto.
- **Adequação ao apetite derivado** (`balanced`): baixa — o catálogo reserva Big Bang para apetite `transformational`; aqui o operador já demonstrou preferência por pragmatismo/baixo risco ao escolher paradigma híbrido em vez de transformacional.
- **Trade-offs**:
  - Prós: entrega mais rápida da experiência web completa; menor custo de manter dois caminhos.
  - Contras: nenhuma validação incremental antes de descontinuar o CLI — se a recuperação de FK ou a cópia de dados tiver um bug na reimplementação, o operador só descobre em uso real, sem um "modo de comparação" prévio. Vai direto contra o fator de risco #1 declarado no brief.

## Comparativo

| Critério | A (Strangler Fig) | B (Parallel Run) | C (Big Bang) |
|---|---|---|---|
| Custo | médio | alto | baixo |
| Risco | baixo | médio | alto |
| Tempo | longo | médio | curto |
| Aderência ao apetite (`balanced`) | alta | alta | baixa |
| Compatibilidade com mudança de paradigma | alta — cada feature migra e estabiliza no paradigma híbrido antes da próxima | alta — valida que o pipeline sequencial interno preservado (decisão híbrida) produz o mesmo resultado do legado | baixa — não dá chance de descobrir gap de paradigma antes do corte total |

## Recomendação do Strategist
- **Estratégia recomendada**: **A (Strangler Fig) combinada com B (Parallel Run) para as duas features de maior risco** — `migracao-de-tabelas` e `migracao-de-rotinas`. As demais features (`arquivo-de-configuracao`, `relatorios-de-migracao`, `correcao-de-collation`) seguem só Strangler Fig, sem necessidade de parallel run formal (menor risco de correção, mais risco de UX/produto).
- **Justificativa**: o apetite `balanced` e o gap de paradigma alto (mitigado, não eliminado, pela escolha híbrida) apontam diretamente para essa combinação, conforme o catálogo. Mais decisivo ainda: a própria métrica de sucesso declarada pelo operador ("conseguir acessar o banco migrado com os objetos íntegros") e o fator de risco #1 ("tabela/procedure não chegar íntegra") são exatamente o tipo de risco que Parallel Run existe para mitigar — mesmo este não sendo um domínio financeiro/regulatório clássico.

## Sinais de alerta específicos
- Gap de paradigma alto + apetite balanced → combinação Strangler Fig + Parallel Run é a recomendação padrão do catálogo para este par, e neste caso também é a que melhor atende ao risco de negócio declarado pelo próprio operador.
- Se o operador priorizar velocidade sobre validação incremental durante a decisão humana abaixo, registrar explicitamente em `risk_register.md` que o risco #1 do brief (integridade de tabelas/procedures) passa a não ter uma rede de segurança formal antes do corte.

## Decisão humana
- **Estratégia escolhida**: A + B — Strangler Fig por feature, com Parallel Run obrigatório para `migracao-de-tabelas` e `migracao-de-rotinas`
- **Quem decidiu**: operador (Área de Infraestrutura)
- **Quando**: 2026-09-15T20:10:00Z
- **Justificativa do decisor**: aceitou a recomendação do Strategist sem alteração.
