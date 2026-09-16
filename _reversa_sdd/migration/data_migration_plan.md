---
schemaVersion: 1
generatedAt: 2026-09-15T20:45:00Z
reversa:
  version: "1.3.3"
kind: data_migration_plan
producedBy: designer
hash: "sha256:c785e00467f73758a0c401709252f2f1a93c8d9309fb7894dd9649d779485329"
---

# Data Migration Plan

> Plano de migração dos dados do legado para o sistema novo.
>
> **Caso atípico, declarado explicitamente**: o legado (`migrate_routines.py`/`fix_collation_stamp.py`) nunca teve um banco de dados de aplicação próprio — é uma ferramenta stateless entre execuções, que opera sobre bancos MySQL arbitrários fornecidos pelo operador em tempo de execução (`erd-complete.md`). Portanto, **não existe "dado de aplicação legado" para migrar** para o `target_data_model.md` no sentido tradicional deste template (não há um `tb_pedidos` do legado para portar). O único material persistido pelo legado são os diretórios de execução passada (`migration_report_*/`, `fix_collation_*/`) — artefatos de auditoria em disco, não uma base de dados viva.

## Resumo
- Volume estimado: 5 diretórios `migration_report_*/` + 1 diretório `fix_collation_*/` encontrados no repositório atual (`inventory.md`) — volume desprezível (poucos KB de JSON/SQL/HTML cada).
- Janela de migração: nenhuma janela formal necessária — não há dado "vivo" a cortar (ver `cutover_plan.md` § Notas, mesmo raciocínio).
- Estratégia: **importação histórica opcional (backfill único, sem captura de delta)** dos relatórios de execuções passadas do legado para `job_reports` — não é uma migração obrigatória, é uma conveniência de continuidade de histórico.

## Mapeamento legado → novo

| Origem | Destino | Tipo | Notas |
|---|---|---|---|
| `migration_report_<timestamp>/report.json` (5 ocorrências atuais) | `job_reports.report_json` | importação histórica opcional | sem `job_id` real correspondente — ver Transformação T-01 |
| `migration_report_<timestamp>/report.html` | `job_reports.report_html` | importação histórica opcional | idem |
| `migration_report_<timestamp>/migration.sql` | `job_reports.migration_sql` | importação histórica opcional | idem |
| `fix_collation_<database>_<timestamp>/log.json` + `recreated.sql` | `job_reports` (com `migration_jobs.feature = 'collation_fix'`) | importação histórica opcional | schema de `log.json` é diferente de `report.json` — precisa de adaptador próprio, não reaproveita a mesma transformação |
| Bancos MySQL de origem/destino que o operador aponta em cada execução | (nenhum — não fazem parte do "dado de aplicação" a migrar) | não aplicável | são o **objeto de negócio** da ferramenta, não dado da própria aplicação; continuam sendo descobertos em runtime pelas features `routines`/`tables`/`collation-fix`, exatamente como no legado |

## Transformações

### Transformação T-01: Importação de relatório histórico (`migrate_routines.py`)
- **Aplica em**: cada diretório `migration_report_<timestamp>/` presente no ambiente onde a aplicação nova é implantada.
- **Regra**: criar um `migration_jobs` sintético com `status = 'completed'`, `feature` inferida do conteúdo de `report.json` (rotinas e/ou tabelas presentes), `started_at`/`finished_at` derivados do `<timestamp>` do nome do diretório; anexar o conteúdo bruto de `report.json`/`.html`/`migration.sql` em `job_reports`.
- **Tratamento de inválidos**: diretório sem `report.json` legível (corrompido/incompleto) — pular e registrar aviso, não abortar a importação dos demais.
- **Origem da regra**: nova (não existe no legado) — é uma conveniência de UX para não perder histórico ao adotar a aplicação nova.

### Transformação T-02: Importação de log histórico (`fix_collation_stamp.py`)
- **Aplica em**: cada diretório `fix_collation_<database>_<timestamp>/`.
- **Regra**: criar um `migration_jobs` sintético com `feature = 'collation_fix'`, mapear `log.json` (schema diferente de `report.json`, ver `data-dictionary.md` § "log.json") para a mesma estrutura de `job_reports.report_json`, com um adaptador dedicado (não reaproveitar T-01 diretamente).
- **Tratamento de inválidos**: mesmo critério de T-01.
- **Origem da regra**: nova.

## Estratégia de ETL

- **Ferramenta**: script único de importação (ex: um comando CLI da própria aplicação nova, tipo `import-legacy-reports <diretório-do-repo-legado>`), rodado manualmente uma vez pelo operador durante a adoção — não é um processo contínuo.
- **Fluxo**:
  1. Varrer o diretório do repositório legado por pastas `migration_report_*/` e `fix_collation_*/`.
  2. Aplicar T-01 ou T-02 conforme o padrão de nome do diretório.
  3. Inserir os `migration_jobs`/`job_reports` sintéticos no App DB.
- **Idempotência**: usar o nome do diretório de origem como chave de deduplicação (ex: armazenar o nome original num campo auxiliar) — reexecutar o import não duplica jobs já importados.
- **Throughput esperado**: irrelevante (volume de poucas dezenas de diretórios, no máximo).

## Backfill e delta

- **Backfill**: único, sob demanda, executado pelo operador ao adotar a aplicação nova (não há data fixa — cada ambiente decide se quer importar o histórico local).
- **Captura de delta**: não aplicável — não há um processo contínuo gerando novos relatórios no legado depois que uma feature migra para a web (a partir daí, os relatórios novos já nascem na `job_reports` via execução normal da aplicação, não via import).
- **Reconciliação periódica**: não aplicável.

## Cutover de dados

> Ver também `cutover_plan.md` para o cutover de funcionalidade. Esta seção documenta apenas a parte de dados históricos, que é opcional e não bloqueia nenhum cutover de feature.

- **Janela**: nenhuma — a importação histórica pode rodar a qualquer momento, antes, durante ou depois do cutover de qualquer feature, sem afetar a operação normal.
- **Sequência de corte**: não aplicável (não há corte de dados "vivos").
- **Verificação pós-corte**: contar quantos diretórios existiam no legado vs. quantos `migration_jobs` sintéticos foram criados — divergência esperada apenas nos casos descritos em "Tratamento de inválidos" acima.

## Validação de qualidade

| Métrica | Alvo | Fonte de medição |
|---|---|---|
| Diretórios de relatório importados | igual ao número de diretórios válidos encontrados | comparação direta (contagem de pastas vs. linhas em `job_reports` com `created_by = 'import-legacy'`) |
| Integridade dos MySQL de origem/destino durante migrações reais (novas, não históricas) | 0 tabelas/rotinas incompletas — ver RISK-002 | Parallel Run (`migration_strategy.md`), não este plano de dados |

## Riscos específicos de dados

- Nenhum risco crítico associado à importação histórica em si (é opcional, de baixo volume, sem impacto se falhar parcialmente).
- O risco de dados real desta iniciativa é **RISK-001**/**RISK-002** em `risk_register.md` — sobre a correção da migração de bancos MySQL de terceiros feita pela ferramenta, não sobre o dado de aplicação da própria ferramenta (que é o escopo deste documento).

## Notas

Este documento é deliberadamente enxuto porque o "plano de migração de dados" clássico (ETL de linhas de produção de um banco legado para um banco novo) não se aplica a este projeto — a real complexidade de dados desta migração está inteiramente capturada em `_reversa_sdd/migracao-de-tabelas/` (a própria feature que a ferramenta implementa), não na migração da ferramenta em si. O agente de codificação não deve tratar a importação histórica opcional acima como prioridade — é uma conveniência de baixo risco, não um bloqueador de nenhuma feature.
