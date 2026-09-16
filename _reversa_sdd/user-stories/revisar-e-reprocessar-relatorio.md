# User Story — Revisar e reprocessar o relatório de migração

> Fonte: `relatorios-de-migracao/requirements.md`, `code-analysis.md` (Feature: relatorios-de-migracao), `data-dictionary.md` (schema `report_data`), ADR-0004.
> Unit relacionada: `relatorios-de-migracao/`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## História

**Como** um DBA/operador que acabou de rodar uma migração (ou um processo automatizado que consome seu resultado),
**Eu quero** um relatório de auditoria completo em formatos legíveis por humano e por máquina, incluindo scripts prontos para reprocessar apenas os itens que falharam,
**Para que** eu possa confirmar o que foi migrado com sucesso, investigar o que falhou, e corrigir/reaplicar só os itens problemáticos sem repetir a migração inteira. 🟢

## Contexto de negócio

O relatório é gerado em 3 formatos porque os consumidores são heterogêneos: pelo menos um humano (DBA revisando o resultado via HTML, sem precisar de nenhuma ferramenta instalada) e potencialmente um processo automatizado (reprocessamento via `report.json`/`retry_*.sql`). 🟡 Falha ao salvar o relatório nunca desfaz a migração já aplicada ao banco — é puramente um problema de auditoria, não de integridade dos dados migrados (ver ADR-0004). 🟢

## Personas

| Persona | Papel | Motivação |
|---|---|---|
| DBA/Operador | Abre `report.html` no navegador (via `file://`, sem servidor) para revisar visualmente o resultado | Confirmar rapidamente quais rotinas/tabelas aplicaram com sucesso e quais precisam de atenção 🟢 |
| Processo automatizado / próxima execução do operador | Consome `report.json` ou executa `retry_routines.sql`/`retry_tables.sql` | Reprocessar apenas os itens com erro, sem intervenção manual item a item 🟡 |

## Cenários

```gherkin
Cenário: Relatório completo gerado ao final de uma migração com falhas parciais
  Dado que a migração processou 3 rotinas (2 aplicadas, 1 com erro) e 2 tabelas (ambas aplicadas)
  Quando o operador confirma salvar o relatório
  Então report.json, report.html e migration.sql são gerados no diretório migration_report_<timestamp>/
    E retry_routines.sql é gerado (há 1 rotina com erro e ddl_fixed disponível)
    E retry_tables.sql NÃO é gerado (nenhuma tabela com erro)

Cenário: Revisar o resultado visualmente sem depender de rede ou build
  Dado que report.html foi gerado ao final da migração
  Quando o operador abre o arquivo diretamente no navegador (file://)
  Então o relatório é exibido corretamente, com CSS e JS inline
    E o operador consegue filtrar rotinas/tabelas pelo nome usando o filtro de texto embutido

Cenário: Reprocessar apenas os itens com erro
  Dado que retry_routines.sql foi gerado após uma migração com 1 rotina em erro
  Quando o operador executa esse script contra o banco de destino
  Então apenas a rotina com DDL corrigido é (re)aplicada, sem repetir as rotinas já bem-sucedidas

Cenário: Diretório de trabalho sem permissão de escrita
  Dado que o diretório de trabalho atual não tem permissão de escrita
  Quando o operador confirma salvar o relatório
  Então o relatório é salvo no diretório temporário do sistema operacional, com aviso ao operador
    E a migração já aplicada ao banco permanece intacta e não é revertida

Cenário: Diretório temporário também indisponível
  Dado que nem o diretório de trabalho nem o diretório temporário do SO são graváveis
  Quando o operador confirma salvar o relatório
  Então a função de relatório retorna sem gerar nenhum arquivo, avisando o operador
    E a migração já aplicada ao banco não é afetada de forma alguma
```

## Critérios de aceite (resumo)

- Toda rotina/tabela processada aparece no resumo do terminal, com status coerente com o resultado real. 🟢
- `report.json` tem contagens (`applied`/`errors`/`skipped`) que batem exatamente com o número de items processados. 🟢
- `report.html` abre em qualquer navegador sem requisição de rede. 🟢
- `migration.sql` é SQL válido e executável do início ao fim, com tabelas antes de rotinas. 🟢
- `retry_*.sql` só existem quando há pelo menos um item com erro e DDL corrigido disponível. 🟢
- Falha ao salvar relatório nunca aborta nem reverte a migração já aplicada. 🟢

## Limitação conhecida

`issues` em `report.json` mantém só `code/severity/description` — perde os campos `original`/`fixed` da classe `Issue`. Quem precisa do "antes/depois" completo de uma correção específica precisa ler `migration.sql`, não `report.json`. 🟢

## Fora de escopo desta história

- Geração dos dados que alimentam o relatório (`routine_results`/`table_results`) — ver [Migrar schema e dados](migrar-schema-e-dados.md).

## Rastreabilidade

| Unit | Requisitos cobertos |
|---|---|
| `relatorios-de-migracao/` | RF-01 a RF-06 (`requirements.md`) |
