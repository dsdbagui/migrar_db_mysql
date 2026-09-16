# relatorios-de-migracao — Tarefas de Implementação

> Sequência executável para reimplementar esta unit a partir do legado (`migrate_routines.py`), com rastreabilidade.

## Pré-requisitos

- [ ] `routine_results`/`table_results` disponíveis, já populados por `migracao-de-rotinas`/`migracao-de-tabelas`
- [ ] Output Helpers (`info/ok/warn/error`) disponíveis
- [ ] Classe `Issue` definida (compartilhada com as units de migração)

## Tarefas

- [ ] T-01, Implementar `print_summary_table(results)` e `print_table_summary(table_results)` — resumo no terminal (rich `Table` ou fallback texto simples)
  - Origem no legado: `migrate_routines.py:1077`, `:1115`
  - Critério de pronto: lista de resultados de N rotinas/tabelas produz uma linha por item, com status (`applied`/`skipped`/erro) coerente com os campos do dict
  - Confiança: 🟢

- [ ] T-02, Implementar `render_html_report(data)` — HTML autocontido a partir de `report_data`: cards de totais, uma linha por tabela/rotina, issues agrupadas por severidade (E/A/I), CSS e filtro de busca por texto inline
  - Origem no legado: `migrate_routines.py:1168`
  - Critério de pronto: HTML gerado abre em navegador via `file://` sem requisição de rede; filtro de texto encontra corretamente uma rotina/tabela por nome
  - Confiança: 🟢

- [ ] T-03, Implementar `save_report(routine_results, src_db, dst_db, table_results)` — orquestra a criação do diretório `migration_report_<timestamp>/`, com fallback para o diretório temp do SO em `OSError`, e retorno `None` (sem exceção) se nenhum dos dois for gravável
  - Origem no legado: `migrate_routines.py:1338`
  - Critério de pronto: diretório de trabalho não gravável (simulado) não interrompe a execução; relatório aparece no temp dir do SO com aviso; falha total retorna `None` sem lançar exceção
  - Confiança: 🟢

- [ ] T-04, Montar `report_data` (totais + items de rotinas e tabelas) e escrever `report.json`
  - Origem no legado: `migrate_routines.py:1362-1410`
  - Critério de pronto: JSON válido; contagens (`total/applied/errors/skipped`) batem com o número real de items em cada categoria
  - Confiança: 🟢

- [ ] T-05, Montar `migration.sql` — DDLs corrigidos (tabelas primeiro, depois rotinas), cada issue como comentário SQL acima do DDL correspondente, envolvido em `SET FOREIGN_KEY_CHECKS=0/1`
  - Origem no legado: `migrate_routines.py:1338-1498`
  - Critério de pronto: arquivo gerado é SQL sintaticamente válido; ordem tabelas→rotinas preservada; comentários de issue aparecem imediatamente acima do DDL correspondente
  - Confiança: 🟢

- [ ] T-06, Escrever `retry_routines.sql`/`retry_tables.sql` condicionalmente (apenas quando há item com erro e `ddl_fixed` disponível); `retry_tables.sql` inclui `DROP TABLE IF EXISTS` antes de cada `CREATE`
  - Origem no legado: `migrate_routines.py:1338-1498`
  - Critério de pronto: com 1 rotina e 1 tabela com erro, ambos os arquivos são gerados; sem nenhum erro, nenhum dos dois é gerado
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01, Teste do happy path: relatório completo (3 arquivos) gerado corretamente para uma migração sem erros (ver `requirements.md`, Critérios de Aceitação)
- [ ] TT-02, Teste do caso de erro: diretório de trabalho sem permissão de escrita cai para o temp dir do SO, com aviso
- [ ] TT-03, Teste de falha total: nem diretório de trabalho nem temp dir graváveis — `save_report` retorna `None`, migração não é afetada
- [ ] TT-04, Teste de `retry_routines.sql`/`retry_tables.sql` condicionais — presentes só quando há erro com `ddl_fixed`
- [ ] TT-05, Teste de reexecução: `migration.sql` gerado roda do início ao fim sem erro contra um banco limpo (ver `design.md`, Riscos e Lacunas)

## Tarefas de Migração de Dados

N/A — esta unit não migra dados, apenas reporta o resultado de outras units.

## Ordem Sugerida

1. T-01 (resumo de terminal) é independente das demais e pode ser feita primeiro/isoladamente.
2. T-03 (orquestração de diretório) deve vir antes de T-04/T-05/T-06, que dependem do diretório já resolvido.
3. T-04, T-05 e T-06 podem ser feitas em paralelo — cada uma escreve um artefato independente a partir do mesmo `report_data`.
4. T-02 (HTML) depende de `report_data` já montado (T-04), mas é independente de T-05/T-06.

## Decisões de Revisão (2026-09-15)

- **Arquitetura de saída:** decidido consolidar `report.json`/`report.html`/`migration.sql` sob um único template/serializador reutilizável a partir de `report_data`, em vez de manter as três funções de renderização independentes do legado (`../questions.md#pergunta-8`) — novo requisito arquitetural para T-02/T-04/T-05/T-06.
- **Auditoria de "quem rodou":** decidido que não é relevante para o caso de uso — não é necessário adicionar usuário do SO/MySQL a `report_data` (`../questions.md#pergunta-9`).

## Lacunas Pendentes (🔴)

- Não há teste automatizado que valide a reexecução de `migration.sql` contra um banco limpo, e o operador não confirmou esse comportamento em uso real (`../questions.md#pergunta-7`) — a reimplementação deveria incluir esse teste antes de considerar o artefato confiável para uso real de recuperação de desastre.
