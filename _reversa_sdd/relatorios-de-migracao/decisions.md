# relatorios-de-migracao — Decisões Arquiteturais

> Decisões que afetam especificamente esta unit. Fonte completa em `../adrs/`.

## ADR-0004 — Relatório de migração em três formatos, HTML autocontido sem dependências externas

- **Status:** Aceito (implícito) · **Confiança:** 🟡 INFERIDO

`save_report` gera três artefatos a partir da mesma estrutura de dados (`report_data`): `report.json` (consumo automatizado/reprocessamento), `report.html` (visualização humana, CSS e JavaScript de filtro **inline**, sem CDN, sem build step, abre via `file://`) e `migration.sql` (DDLs efetivamente aplicados, com cada issue anotada como comentário SQL, para revisão linha a linha). Erros geram adicionalmente `retry_routines.sql`/`retry_tables.sql`.

**Por que importa para esta unit:** é a decisão que define toda a arquitetura desta unit — três funções de renderização independentes (`print_summary_table`/`print_table_summary` para o terminal, `render_html_report` para o HTML, a montagem de `migration.sql` embutida em `save_report`) consumindo a mesma fonte de dados, sem um serializador único compartilhado. Uma reimplementação que introduzisse um formato adicional (ex: CSV, Markdown) precisaria decidir se segue o mesmo padrão de função de renderização independente ou consolida num template engine — ver Riscos e Lacunas em `design.md`.

**Trade-off aceito:** os três formatos precisam ser mantidos em sincronia manualmente — não há uma única fonte serializada e depois formatada em 3 saídas via templates reutilizáveis. `issues` em `report.json` perde os campos `original`/`fixed` da classe `Issue` (só mantém `code/severity/description`); quem precisa do "antes/depois" completo de uma correção precisa ler `migration.sql`.

### Adendo — 2026-09-15 (commit `971bdf5`)

`save_report()` deixou de propagar `PermissionError`/`OSError` sem tratamento quando o diretório de trabalho atual não é gravável. Agora tenta `Path(tempfile.gettempdir()) / report_dir.name` como fallback; se isso também falhar, `warn()` e retorna `None` em vez de abortar o processo — a migração já aplicada ao banco não é desfeita nem afetada, só o relatório fica indisponível. `main()` precisa checar `report_dir is not None` antes de imprimir os caminhos dos arquivos.

**Por que o adendo importa para esta unit:** é a decisão que torna esta unit *não bloqueante* — antes de `971bdf5`, uma falha de permissão de disco durante a geração do relatório interrompia o processo com uma exceção não tratada, mesmo que a migração em si já tivesse sido aplicada com sucesso ao banco. Isso separa claramente a responsabilidade desta unit (auditoria, best-effort) da responsabilidade das units de migração (aplicar mudanças no banco, que já aconteceu e não deve ser revertida por um problema de relatório).

Ver ADR completo em `../adrs/0004-relatorio-em-tres-formatos-sem-dependencias-externas.md`.

### Adendo 2 — 2026-09-15 (revisão, `../questions.md#pergunta-8`)

Decidido com o operador que a **reimplementação** deve romper com esse trade-off: consolidar os três formatos sob um serializador/template único a partir de `report_data`, em vez de manter três funções de renderização independentes mantidas em sincronia manualmente. Isso não é uma característica do legado a preservar — é uma melhoria arquitetural deliberada para a próxima versão.
