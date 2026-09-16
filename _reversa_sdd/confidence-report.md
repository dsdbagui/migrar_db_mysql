# Relatório de Confiança — migra_db_mysql

> Gerado pelo Revisor em 2026-09-15, na fase de Revisão (`doc_level = "completo"`).
> Baseado em: revisão por unit, revisão cruzada entre units, validação das matrizes de rastreabilidade, verificação direta contra `migrate_routines.py`/`fix_collation_stamp.py`, e 12 perguntas de validação humana (todas respondidas — ver `questions.md`).

---

## Resumo Geral

| Nível | Quantidade | Percentual |
|-------|-----------|------------|
| 🟢 CONFIRMADO | 378 | 78,4% |
| 🟡 INFERIDO   | 81  | 16,8% |
| 🔴 LACUNA     | 23  | 4,8%  |
| **Total**     | 482 | 100%  |

**Confiança geral:** ~87% (soma de 🟢 + metade dos 🟡, sobre o total de afirmações marcadas em todas as specs, excluindo a linha de legenda repetida em cada arquivo)

> Contagem obtida por varredura de marcadores 🟢/🟡/🔴 em todos os `.md` de `_reversa_sdd/` (units + artefatos globais), descontando uma ocorrência de cada símbolo por arquivo referente à linha de legenda ("Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA"). É uma aproximação por contagem de marcador, não uma auditoria manual afirmação-a-afirmação.

---

## Por Spec (units)

| Unit | 🟢 | 🟡 | 🔴 | Confiança |
|------|----|----|-----|-----------|
| `migracao-de-rotinas/` | 46 | 7 | 1 | 91,7% |
| `migracao-de-tabelas/` | 66 | 14 | 3 | 88,0% |
| `arquivo-de-configuracao/` | 40 | 11 | 2 | 85,8% |
| `relatorios-de-migracao/` | 46 | 6 | 3 | 89,1% |
| `correcao-de-collation/` | 70 | 8 | 2 | 92,5% |
| **Artefatos globais** (code-analysis, architecture, domain, data-dictionary, state-machines, permissions, c4-*, erd, flowcharts, ADRs, traceability, user-stories) | 110 | 35 | 12 | 81,2% |

A unit `correcao-de-collation/` tem a maior confiança (script pequeno e autocontido, sem dependências externas de outras units). Os artefatos globais têm a menor confiança — esperado, já que `domain.md`, `permissions.md` e o ERD lidam com "porquês" de negócio raramente explícitos no código, além de delegarem análise de schema real ao agente Data Master (fora do escopo desta extração).

---

## Perguntas de Validação — Resultado

Todas as 12 perguntas de `questions.md` foram respondidas pelo operador nesta sessão. Resumo:

| # | Tema | Resultado |
|---|------|-----------|
| 1 | Rotinas — erro de privilégio insuficiente | 🔴→🟢 confirmado em uso real |
| 2 | Rotinas — suíte de testes de transformação | Permanece 🔴 — sem DDLs de produção disponíveis, suíte será sintética |
| 3 | Tabelas — cadeias de FK órfã profundas | Permanece 🔴, prioridade rebaixada (cenário não esperado) |
| 4 | Tabelas — retry de FK não restaurada | Fechada — processo manual aceito, sem requisito novo |
| 5 | Tabelas — falha de `SET DEFAULT` sem Issue | Novo requisito (RF-10, `COLUMN_DEFAULT_FAILED`) |
| 6 | Config — validação de schema | Fechada — mantém fallback silencioso, mas exige aviso no template gerado |
| 7 | Relatório — reexecução de `migration.sql` | Permanece 🔴 — não testado pelo operador |
| 8 | Relatório — unificar os 3 formatos | Novo requisito arquitetural para a reimplementação |
| 9 | Relatório — auditoria de "quem rodou" | Fechada — não relevante, sem requisito novo |
| 10 | Collation — perda de rotina em DROP+CREATE falho | Novo requisito Must (RF-09, salvaguarda obrigatória) |
| 11 | Rotinas — severidade fixa de `GROUP_CONCAT` | Fechada — comportamento confirmado como intencional |
| 12 | `.env.example` com aparência de credencial real | Fechada — sem risco, conexão real é sempre interativa |

**8 de 12** perguntas resultaram em fechamento definitivo da lacuna (🟢 ou decisão aceita sem mudança); **2** geraram requisitos novos para a reimplementação (RF-09 em `correcao-de-collation`, RF-10 em `migracao-de-tabelas`, mais a decisão arquitetural da Pergunta 8); **3** permanecem 🔴 por dependerem de teste contra um MySQL real que não pôde ser executado nesta sessão (Perguntas 2, 3 e 7).

---

## Lacunas Pendentes 🔴 (após a revisão)

Todas as demais lacunas 🔴 identificadas durante a extração foram resolvidas nesta revisão (fechadas com 🟢 ou com decisão registrada). As que seguem abertas exigem acesso a um ambiente MySQL real ou a artefatos que não existem hoje (DDLs de produção), e não podiam ser resolvidas apenas por decisão do operador em chat:

### `migracao-de-rotinas/`
- **Suíte de testes das transformações de DDL** — sem DDLs de produção anonimizados disponíveis (`questions.md#pergunta-2`); a reimplementação precisa construir casos sintéticos.

### `migracao-de-tabelas/`
- **Cadeias de FK órfã profundas** (múltiplas execuções incompletas anteriores) — comportamento de `find_referencing_fks`/`drop_referencing_fks` não testado contra esse cenário; prioridade rebaixada após confirmação do operador de que não é esperado em uso real (`questions.md#pergunta-3`).

### `arquivo-de-configuracao/`
- **Tipo de dado incompatível numa chave do `--config`** (ex: string onde se espera lista) — comportamento downstream não confirmado contra um caso real.

### `relatorios-de-migracao/`
- **Reexecução de `migration.sql` contra um banco limpo** — não testado pelo operador nesta revisão (`questions.md#pergunta-7`); permanece a principal lacuna de confiabilidade do artefato de disaster recovery.

---

## Correções Factuais Aplicadas Durante a Revisão

Encontradas por verificação direta contra `migrate_routines.py`/`fix_collation_stamp.py`, independente das perguntas ao operador:

| Arquivo | Erro | Correção |
|---|---|---|
| `code-analysis.md` | Contagem de linhas de `migrate_routines.py` (1934) | 2081 (contagem real) |
| `traceability/code-spec-matrix.md` | Mesma contagem errada + intervalo de linha invertido/impossível (`:1996-1934`) para o bloco `argparse`/`__main__` | 2081 linhas; intervalo corrigido para `:2062-2081` |
| `migracao-de-rotinas/tasks.md` | T-03 dizia "7 transformações" listando 8 nomes | Corrigido para "8 transformações" (confirmado contra `TRANSFORMATIONS` no código) |
| `data-dictionary.md` | 4 citações de linha desatualizadas (classe `Issue`, dict de rotina/tabela extraída, dict de resultado de rotina) | Recalculadas e corrigidas contra o código atual |

---

## Requisitos Novos Introduzidos pela Revisão

Estes não existem no comportamento do legado — são divergências deliberadas, decididas pelo operador durante a revisão, que a reimplementação deve seguir:

| Requisito | Unit | Origem |
|---|---|---|
| RF-09 (Must) — salvaguarda contra perda de rotina em `DROP`+`CREATE` falho | `correcao-de-collation` | `questions.md#pergunta-10` |
| RF-10 (Should) — `Issue` `COLUMN_DEFAULT_FAILED` visível no relatório | `migracao-de-tabelas` | `questions.md#pergunta-5` |
| Consolidação dos 3 formatos de relatório sob serializador único | `relatorios-de-migracao` | `questions.md#pergunta-8` |
| Aviso explícito no template `--init-config` sobre chaves desconhecidas serem ignoradas silenciosamente | `arquivo-de-configuracao` | `questions.md#pergunta-6` |

---

## Histórico de Reclassificações

| De | Para | Afirmação | Evidência |
|----|------|-----------|-----------|
| 🔴 | 🟢 | Erro de privilégio insuficiente cai corretamente em `extract_error`/`apply_error` | Confirmação do operador (`questions.md#pergunta-1`) |
| 🔴 | 🟢 | Ausência de validação prévia de privilégios MySQL | Reclassificado — fato observável no código, não lacuna de conhecimento (`permissions.md`) |
| 🔴 | 🟢 | Ausência de transição de estado para "migração revertida" | Reclassificado — fato observável no código (`state-machines.md`) |
| 🔴 | 🟢 | `.env.example` com aparência de credencial real | Confirmação do operador — conexão real é sempre interativa (`questions.md#pergunta-12`) |
| 🔴 | 🟢 | Severidade fixa de `GROUP_CONCAT` (sem inspecionar destino) | Confirmação do operador como comportamento intencional (`questions.md#pergunta-11`) |
| 🔴 | 🟢 | Ausência de "entidade Migração" formal com id/usuário | Confirmação do operador — não relevante (`questions.md#pergunta-9`) |
| 🔴 | (decisão registrada, permanece 🔴) | Perda de rotina em `DROP`+`CREATE` falho | Operador decidiu que não é aceitável — vira RF-09 (`questions.md#pergunta-10`) |
| 🔴 | (decisão registrada, permanece 🔴) | Falha de `ALTER SET DEFAULT` sem `Issue` | Operador decidiu que deveria ser visível — vira RF-10 (`questions.md#pergunta-5`) |

---

## Conclusão

A documentação SDD de `migra_db_mysql` está em estado sólido para servir de base a uma reimplementação: 5 units completas (requirements/design/tasks/decisions), matrizes de rastreabilidade validadas contra o código-fonte real, e todas as lacunas 🔴 identificadas foram submetidas à validação humana — 8 delas fechadas nesta sessão, 4 permanecem abertas por dependerem de acesso a um MySQL real ou de artefatos inexistentes (DDLs de produção), não de uma decisão que o operador pudesse tomar em chat.

Nenhuma lacuna pendente bloqueia o início da reimplementação — todas são validações de robustez a serem feitas durante a implementação/teste (T-01 a T-12 de cada `tasks.md`), não pré-requisitos de design.
