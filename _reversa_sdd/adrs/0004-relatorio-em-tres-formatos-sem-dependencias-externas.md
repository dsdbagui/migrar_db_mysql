# ADR-0004 — Relatório de migração em três formatos, HTML autocontido sem dependências externas

- **Status:** Aceito (implícito)
- **Confiança:** 🟡 INFERIDO

## Contexto

Uma execução de migração precisa deixar rastro auditável do que foi feito, quais problemas foram encontrados e o que falhou (para reprocessamento).

## Decisão

`save_report` gera três artefatos a partir da mesma estrutura de dados (`report_data`): `report.json` (para consumo automatizado/reprocessamento), `report.html` (visualização humana, com CSS e JavaScript de filtro **inline** — sem CDN, sem build step, abre via duplo clique/`file://`) e `migration.sql` (os DDLs efetivamente aplicados, com cada issue anotada como comentário SQL acima do trecho correspondente, para revisão linha a linha por um DBA). Erros geram adicionalmente `retry_routines.sql`/`retry_tables.sql` prontos para reexecução manual.

## Consequências

- ✅ O relatório HTML funciona em qualquer ambiente sem necessidade de servidor web ou instalação adicional — importante para um contexto onde o script roda numa máquina de operação/bastion sem acesso à internet.
- ✅ `migration.sql` serve tanto como artefato de auditoria quanto como possível ponto de partida para reaplicar manualmente em outro ambiente.
- ⚠️ Os três formatos precisam ser mantidos em sincronia manualmente (não há um único "source of truth" serializado e depois formatado em 3 saídas via templates reutilizáveis — cada função de renderização monta sua própria representação a partir do mesmo `report_data`, mas com lógica de apresentação própria).
- ⚠️ `issues` em `report.json` perde os campos `original`/`fixed` da classe `Issue` (só mantém `code/severity/description`) — quem precisa do "antes/depois" completo de uma correção precisa ler `migration.sql`, não `report.json`.
