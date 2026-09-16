---
schemaVersion: 1
generatedAt: 2026-09-15T20:20:00Z
reversa:
  version: "1.3.3"
kind: topology_decision
producedBy: designer
hash: "sha256:3cfd8fd1a13d0f1081d482cd72e33c71b0730907c116fd323fd648d3f66a3403"
---

# Topology Decision

> Decisão consciente sobre como organizar o sistema novo: preservar a topologia do legado, adotar uma topologia moderna ou aplicar um híbrido.
> Este artefato é leitura obrigatória do próprio Designer (para decompor bounded contexts) e do agente de codificação (para criar a árvore de pastas).

## Topologia do legado detectada
- **Padrão organizacional**: monolito de script único, sem fronteiras de pasta
- **Confiança**: 🟢 CONFIRMADO
- **Evidências**:
  - `inventory.md` § Visão geral / Estrutura de pastas — "Repositório pequeno, sem estrutura de pastas de aplicação: dois scripts Python de linha de comando, autocontidos [...] Nenhuma pasta top-level de domínio; toda a lógica de negócio vive dentro dos dois arquivos `.py`."
  - `architecture.md` § dívidas técnicas — duplicação de código entre os dois scripts (helpers de output, conexão, remoção de DEFINER) em vez de módulo compartilhado.
  - `traceability/code-spec-matrix.md` — as 5 features (`migracao-de-rotinas`, `migracao-de-tabelas`, `arquivo-de-configuracao`, `relatorios-de-migracao`, `correcao-de-collation`) não correspondem a pastas reais — são uma organização lógica que o próprio Time de Descoberta precisou inferir a partir de blocos de código dentro dos arquivos `.py`, não uma estrutura já existente no legado.
- **Mapa da árvore legada** (resumido):
  ```
  migra_db_mysql/
  ├── migrate_routines.py       # ~2081 linhas — 4 das 5 features inteiras aqui dentro
  ├── fix_collation_stamp.py    # ~476 linhas — 5ª feature, duplica helpers do arquivo acima
  ├── .env / .env.example
  └── migration_report_*/, fix_collation_*/   # saídas de execução, não código
  ```

## Diagnóstico estrutural
- **Acoplamento**: baixo entre as transformações de DDL (funções puras `(ddl) -> (ddl, Issue)`, independentes entre si) e as principais rotinas do fluxo, mas **alto** entre `fix_collation_stamp.py` e `migrate_routines.py` no nível conceitual — ambos reimplementam a mesma lógica de conexão/output/remoção de DEFINER de forma independente (ADR-0005), sem nenhum acoplamento de código real, mas com duplicação total.
- **Coesão por módulo**: alta dentro de cada função individual (cada transformação faz uma coisa); baixa no nível do arquivo — um único arquivo de 2081 linhas mistura configuração, conexão, extração, transformação, aplicação e relatório sem separação física.
- **Módulos órfãos / mortos**: nenhum confirmado.
- **Camadas redundantes**: nenhuma — ao contrário, faltam camadas (não há separação entre lógica de negócio e I/O de terminal/banco).
- **Violações de fronteira**: a duplicação entre os dois scripts é, na prática, uma violação de fronteira ao contrário — o que deveria ser uma fronteira compartilhada (Connection Manager, Output Helpers) foi implementado duas vezes.
- **Mistura de paradigmas/estilos**: homogêneo (procedural em ambos os arquivos).
- **Avaliação geral**: **parcialmente problemática** — a lógica de negócio em si é limpa e bem isolada em funções puras (isso favorece a portabilidade), mas a ausência de qualquer estrutura de pastas/módulos e a duplicação entre os dois scripts são débitos reais que uma reimplementação deveria corrigir, não replicar.

## Topologia moderna proposta
- **Padrão**: **vertical slices por feature** (uma pasta por feature: `routines/`, `tables/`, `config/`, `reports/`, `collation-fix/`), com um pacote `core/` compartilhado para infraestrutura transversal (Connection Manager, credenciais/cofre, output/logging, job runner, tipo `Issue`).
- **Justificativa**: alinha-se diretamente com três decisões já tomadas neste pipeline — (1) a decomposição em 5 features já usada por todo o `_reversa_sdd/` (`traceability/code-spec-matrix.md`), preservando rastreabilidade quase 1:1; (2) a estratégia de migração escolhida (Strangler Fig por feature, `migration_strategy.md`), que exige bordas explícitas para substituir uma feature de cada vez sem tocar nas outras; (3) o paradigma híbrido/balanced (`paradigm_decision.md`), que pede simplicidade sobre modelagem DDD pesada.
- **Ganhos concretos esperados**:
  - Cada feature pode ser testada, implantada e colocada em Parallel Run isoladamente — exatamente o que `cutover_plan.md` exige para `migracao-de-tabelas`/`migracao-de-rotinas`.
  - Elimina a duplicação de helpers entre os dois scripts do legado (ADR-0005) — `correcao-de-collation` passa a compartilhar o mesmo `core/` das demais features, em vez de reimplementar tudo.
  - Onboarding mais simples para o time de codificação — a estrutura de pastas espelha exatamente as specs já existentes em `_reversa_sdd/<feature>/`.
- **Custo / risco**:
  - Esforço inicial de definir a interface do `core/` (Connection Manager, cofre de credenciais) antes de portar a primeira feature.
  - Risco de acoplamento indevido entre slices se o `core/` crescer demais com lógica específica de uma feature só — precisa de disciplina de revisão.
- **Esboço da árvore proposta**:
  ```
  src/
  ├── core/                     # Connection Manager, cofre de credenciais, output/logging, job runner, tipo Issue
  ├── features/
  │   ├── routines/              # migracao-de-rotinas
  │   ├── tables/                # migracao-de-tabelas (+ FK recovery)
  │   ├── config/                # arquivo-de-configuracao (validação de payload/wizard)
  │   ├── reports/                # relatorios-de-migracao (serializador único, ver BR-MIGRAR-016)
  │   └── collation-fix/          # correcao-de-collation
  └── api/                       # rotas HTTP / wizard multi-step (BR-HUMANA-001)
  ```

## Opções apresentadas ao usuário
1. **Preservar topologia legada** (conservador)
   - Consequências: replicar "tudo num arquivo grande por ferramenta" numa aplicação web não faz sentido operacional (sem rotas, sem separação testável) e perpetuaria a duplicação de helpers entre `collation-fix` e o resto — não há vantagem real em preservar aqui, mesmo com apetite `balanced`.
2. **Adotar topologia moderna proposta** (transformacional)
   - Consequências: reorganização completa em vertical slices + `core/` compartilhado; corrige a duplicação e alinha com a estratégia de Strangler Fig; exige definir a interface do `core/` antes de portar a primeira feature.
3. **Híbrido** (equilibrado)
   - Consequências: adota a estrutura de pastas em vertical slices (elimina a bagunça de arquivo único) **mas** mantém a lógica de negócio interna de cada feature o mais próxima possível de uma tradução literal das funções puras do legado — sem introduzir camadas de abstração adicionais (interfaces, DI pesado, aggregates ricos) que o paradigma híbrido já descartou como over-engineering para este porte de projeto.

## Recomendação do Designer
**Opção 3 (Híbrido)** — pelas mesmas razões que already levaram à escolha do paradigma híbrido: o ganho de separar em pastas por feature é real e barato (resolve a duplicação, viabiliza Strangler Fig), mas modelar cada feature como um domínio rico (aggregates, DDD completo) seria desproporcional para 5 features de transformação de DDL + orquestração de conexões MySQL. A opção 2 traria o mesmo ganho estrutural, mas convida a sobre-modelar o domínio interno, o que o operador já sinalizou não querer ao escolher o paradigma balanced.

**Qual opção você escolhe?**

## Decisão do usuário
- **Escolha**: 3 (Híbrido)
- **Justificativa do usuário**: aceitou a recomendação do Designer sem alteração.
- **Decidido em**: 2026-09-15T20:30:00Z

## Mapeamento legado → novo
| Módulo / pasta legada | Bounded context novo | Tipo | Observações |
|---|---|---|---|
| `migrate_routines.py:345-574,717-746,1544-1685` (rotinas) | `features/routines/` | dividido (extraído do arquivo único) | Preserva as 8 transformações + `remove_definer` como funções puras |
| `migrate_routines.py:388-746,747-1076,1686-1993` (tabelas) | `features/tables/` | dividido | Inclui FK Recovery Engine (BR-MIGRAR-006), o núcleo mais complexo |
| `migrate_routines.py:55-344,1499-1543,~2062-2081` (config + conexão) | `features/config/` + `core/` (Connection Manager) | dividido | Config Resolver vira validação de payload/wizard (`features/config/`); Connection Manager vira infraestrutura compartilhada (`core/`) — ver `discard_log.md` BR-DESCARTAR-001/002 |
| `migrate_routines.py:1077-1498,1993-2059` (relatório) | `features/reports/` | dividido | Consolidado sob serializador único (BR-MIGRAR-016), não as 3 funções independentes do legado |
| `fix_collation_stamp.py` (inteiro) | `features/collation-fix/` | fundido com `core/` | Deixa de duplicar helpers (ADR-0005) — passa a consumir o mesmo Connection Manager/Output/Issue de `core/` |
| Output Helpers (`info/ok/warn/error/header`, duplicados nos 2 scripts) | `core/` (logging/output) | fundido | Unifica as duas implementações duplicadas em uma só |
| `--init-config`/`.env` (mecanismos de credencial) | `core/` (cofre de credenciais) | novo | Substitui os dois mecanismos divergentes por um único (BR-HUMANA-002) |

## Implicações pendentes para próximos passos do Designer
| Etapa do Designer | Implicação | Como honrar |
|---|---|---|
| Bounded contexts | 5 features do legado mapeiam quase 1:1 para 5 slices, mais um `core` transversal não presente no legado (era duplicado, agora compartilhado) | Ao identificar bounded contexts (passo 8), declarar `core` como contexto de suporte (não de domínio), e as 5 features como contextos de domínio genérico |
| target_architecture | A árvore proposta acima deve aparecer literalmente na seção "Honra à topologia escolhida" | Reutilizar o esboço de árvore deste documento, sem redesenhar do zero |
| target_domain_model | Evitar aggregates ricos — preferir funções/pipelines por slice, coerente com a decisão híbrida (visão 3 tanto de paradigma quanto de topologia) | Modelar "Rotina", "Tabela", "Issue" como estruturas de dados simples (DTOs), não como entidades com comportamento encapsulado |
| target_data_model | O cofre de credenciais (BR-HUMANA-002) e o rastreamento de progresso de job (RISK-004) são as únicas estruturas de dados verdadeiramente novas, sem equivalente no legado | Marcar essas duas como "novo" na tabela de rastreabilidade, não como derivadas de nenhuma estrutura legada |

## Notas
O agente de codificação deve criar a estrutura de pastas exatamente como no esboço acima antes de portar a primeira feature (recomendação: começar por `core/` + `features/tables/`, dado que é onde o Parallel Run está planejado primeiro segundo `cutover_plan.md`).
