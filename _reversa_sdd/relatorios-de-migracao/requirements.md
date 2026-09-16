# relatorios-de-migracao

> Fonte: `code-analysis.md` (Feature: relatorios-de-migracao), `data-dictionary.md` (schema `report_data`), `flowcharts/relatorios-de-migracao.md`, ADR-0004.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão Geral

Ao final do processamento de rotinas e tabelas, gera um relatório de auditoria em três formatos a partir da mesma estrutura de dados (`report_data`): `report.json` (consumo automatizado), `report.html` (visualização humana, autocontido) e `migration.sql` (DDLs aplicados com issues como comentário, para revisão linha a linha), mais scripts de retry para itens com erro. 🟢

## Responsabilidades

- Exibir resumo em tabela no terminal dos resultados de rotinas e tabelas (`print_summary_table`, `print_table_summary`). 🟢
- Montar `report_data` a partir de `routine_results`/`table_results`, com totais agregados e items detalhados. 🟢
- Escrever `report.json` (dados estruturados) e `report.html` (HTML autocontido, CSS/JS inline, sem dependências externas, abre via `file://`). 🟢
- Escrever `migration.sql` com todos os DDLs corrigidos (tabelas primeiro, depois rotinas), issues como comentário SQL, envolvido em `SET FOREIGN_KEY_CHECKS=0/1`. 🟢
- Escrever `retry_routines.sql`/`retry_tables.sql` condicionalmente, apenas quando há item com erro e `ddl_fixed` disponível. 🟢
- Degradar com segurança quando o diretório de trabalho não é gravável: cai para o diretório temporário do SO e, se isso também falhar, avisa e retorna sem gerar relatório — nunca desfaz ou afeta a migração já aplicada. 🟢

## Regras de Negócio

- O relatório é gerado em 3 formatos porque os consumidores são heterogêneos: pelo menos um humano (DBA revisando o resultado, via HTML) e potencialmente um processo automatizado (reprocessamento via `report.json`/`retry_*.sql`). 🟡 Ver `domain.md`, "Sobre relatório em 3 formatos".
- `issues` em `report.json` perde os campos `original`/`fixed` da classe `Issue` (mantém só `code/severity/description`) — quem precisa do "antes/depois" completo de uma correção precisa ler `migration.sql`, não `report.json`. 🟢
- `retry_tables.sql` inclui `DROP TABLE IF EXISTS` antes de cada `CREATE`; `retry_routines.sql` não tem essa necessidade (rotinas já usam `DROP ... IF EXISTS` opcional no fluxo normal). 🟢
- Falha ao salvar relatório (após os dois fallbacks de diretório) nunca desfaz a migração já aplicada ao banco — é puramente um problema de auditoria, não de integridade dos dados migrados. 🟢 Ver ADR-0004, Adendo.

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Exibir resumo no terminal dos resultados de rotinas e tabelas ao final da execução | Must | Toda rotina/tabela processada aparece no resumo, com status coerente com `routine_results`/`table_results` |
| RF-02 | Gerar `report.json` com totais agregados e items detalhados de rotinas e tabelas | Must | JSON válido, contagens batem com o número real de items processados em cada categoria (`applied`/`errors`/`skipped`) |
| RF-03 | Gerar `report.html` autocontido, sem dependências externas, com filtro de texto embutido | Must | Arquivo abre em qualquer navegador via `file://`, sem requisição de rede; filtro funciona sobre nome de rotina/tabela |
| RF-04 | Gerar `migration.sql` com DDLs corrigidos e issues como comentário, tabelas antes de rotinas | Should | Arquivo é SQL válido, executável do início ao fim; ordem tabelas→rotinas preservada |
| RF-05 | Gerar `retry_routines.sql`/`retry_tables.sql` apenas quando há erro com `ddl_fixed` disponível | Should | Arquivos só existem quando há pelo menos um item com erro e DDL corrigido; ausentes quando não há erro |
| RF-06 | Degradar sem crash quando o diretório de trabalho não é gravável | Must | `PermissionError` no diretório atual não interrompe a execução; relatório cai para o diretório temp do SO, e se isso falhar, `save_report` retorna `None` sem lançar exceção |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Disponibilidade | Falha ao salvar relatório não aborta nem desfaz a migração já aplicada — apenas o artefato de auditoria fica indisponível | `migrate_routines.py:1338-1498` (`save_report`, tratamento de `OSError`) | 🟢 |
| Portabilidade | `report.html` não depende de servidor web, CDN ou build step — funciona em ambiente isolado/sem internet | `migrate_routines.py:1168` (`render_html_report`) | 🟢 |
| Auditabilidade | Todo DDL aplicado (corrigido) fica registrado em `migration.sql`, anotado com as issues correspondentes como comentário | `migrate_routines.py:1338-1498` | 🟢 |

> Inferido a partir do código. Sem requisitos de performance explícitos — geração de relatório é single-pass sobre os resultados já acumulados em memória.

## Critérios de Aceitação

```gherkin
Dado que a migração processou 3 rotinas (2 aplicadas, 1 com erro) e 2 tabelas (ambas aplicadas)
Quando o operador confirma salvar o relatório
Então report.json, report.html e migration.sql são gerados no diretório migration_report_<timestamp>/
  E retry_routines.sql é gerado (há 1 rotina com erro e ddl_fixed disponível)
  E retry_tables.sql NÃO é gerado (nenhuma tabela com erro)

Dado que o diretório de trabalho atual não tem permissão de escrita
Quando o operador confirma salvar o relatório
Então o relatório é salvo no diretório temporário do sistema operacional, com aviso ao operador
  E a migração já aplicada ao banco permanece intacta e não é revertida
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|----------------|
| Resumo no terminal (RF-01) | Must | Feedback imediato ao operador, sem depender de arquivo salvo |
| `report.json` (RF-02) | Must | Fonte estruturada única para reprocessamento/integração |
| `report.html` (RF-03) | Must | Único formato pensado para leitura humana sem ferramenta adicional |
| Degradação segura (RF-06) | Must | Falha de relatório não pode comprometer a migração já aplicada |
| `migration.sql` (RF-04) | Should | Auditoria detalhada, mas `report.json` já cobre o essencial para reprocessamento |
| `retry_*.sql` (RF-05) | Could | Conveniência — operador pode montar o retry manualmente a partir de `report.json` |

> Prioridade inferida por centralidade no propósito de auditoria/rastreabilidade (ver CLAUDE.md, "Reporting").

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `migrate_routines.py:1077` | `print_summary_table` | 🟢 |
| `migrate_routines.py:1115` | `print_table_summary` | 🟢 |
| `migrate_routines.py:1168` | `render_html_report` | 🟢 |
| `migrate_routines.py:1338` | `save_report` | 🟢 |
