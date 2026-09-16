# Legacy Impact: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Política de edição do legado no momento da execução: `allowLegacyEdits: true`, `allowedPaths`: `src/features/reports/**`, `src/app.ts`, `tests/features/reports/**`, `web/**`.

## Arquivos afetados

| Arquivo afetado | Componente (`_reversa_sdd/`) | Tipo | Severidade | Justificativa |
|---|---|---|---|---|
| `web/**` (scaffold + telas do wizard) | `c4-components.md#main` — Main Orchestrator (parte interativa: `ask`/`confirm`/fluxo de `main()`) | componente-novo | HIGH | Substitui toda a interatividade de terminal do legado por um wizard web; é o maior ponto de superfície novo desta entrega, e onde a decisão de não ter autenticação de aplicação (D-05, `roadmap.md`) se materializa — qualquer pessoa com acesso à VPN pode operá-lo |
| `src/features/reports/serializer.ts` | `c4-components.md#report` — Report Generator (`print_summary_table`, `render_html_report`, `save_report`) | componente-novo | MEDIUM | Reimplementa a lógica de montagem dos 3 formatos de relatório, mudando a fonte de dados de listas em memória (`routine_results`/`table_results`) para tabelas persistidas (`job_items`) — mesma regra de negócio observável, arquitetura interna diferente (consolidação já decidida em BR-MIGRAR-016) |
| `src/features/reports/routes.ts` | `c4-components.md#report` | contrato-novo | MEDIUM | Introduz `POST`/`GET /jobs/:id/report`, contrato HTTP que não existe no legado (era saída de terminal + arquivo em disco) |
| `src/features/reports/deriveMetadata.ts` | `c4-components.md#report` | componente-novo | LOW | Função pura, deriva metadados de exibição ausentes em `job_items`; sem efeito colateral, sem mudança de regra de negócio |
| `src/app.ts` | `c4-components.md#main` (equivalente parcial — orquestração de entrada) | regra-alterada | LOW | Apenas registra a nova rota; nenhuma lógica de negócio alterada |
| `tests/features/reports/report.routes.test.ts` | `c4-components.md#report` | componente-novo | LOW | Cobertura nova, sem componente legado equivalente a testar |

## Diff conceitual por componente

**Report Generator** (`c4-components.md#report`): no legado, a geração do relatório era síncrona, dentro do mesmo processo que aplicou a migração — `save_report` gravava `report.json`/`report.html`/`migration.sql`/`retry_*.sql` diretamente no disco local, no fim de `main()`. Na versão web, a geração é desacoplada da execução do job: qualquer momento após o job atingir status terminal, um operador pode chamar `POST /jobs/:id/report`, que monta o relatório a partir do que já está persistido em `job_items`/`job_item_fk_specs` (App DB) e o guarda em `job_reports`. As regras de negócio que definem *o que* o relatório contém (3 formatos funcionais, retry só quando há erro, tabelas com `DROP TABLE IF EXISTS` no retry) são preservadas; muda apenas *quando* e *onde* isso acontece.

**Main Orchestrator / interatividade** (`c4-components.md#main`): a sequência "perguntas → preview → confirmação → aplicação" que vivia inteiramente dentro de `main()` (síncrona, bloqueante, terminal) agora é um wizard web de 4 etapas (RF-02 a RF-06), com o job rodando em background via `core/jobRunner.ts` (já existente, sem mudança nesta feature). A regra "mostrar preview de compatibilidade antes de aplicar" (BR-MIGRAR-005) é preservada; o meio de interação muda de terminal para HTTP/DOM.

## Preservadas

Regras de negócio 🟢 (ou com decisão de revisão confirmada) que continuam intactas nesta entrega:

- BR-MIGRAR-003 (falha isolada não aborta o lote) — o wizard só exibe o que `job_items`/`getJobStatus` já reportam, sem alterar essa semântica.
- BR-MIGRAR-005 (preview antes de aplicar) — vira etapa obrigatória do wizard (RN-02), não pode ser pulada.
- BR-MIGRAR-012 (seleção por nome, nunca por índice) — a Etapa 2 do wizard só envia nomes (`select: "all" | string[]`).
- BR-MIGRAR-015 (senha nunca em texto claro) — reforçado no frontend: campo sempre write-only (RF-09), nunca logado.
- BR-MIGRAR-016 (relatório em 3 formatos funcionais) — preservado no novo serializador (`json`/`html`/`sql`, mais `retry`).
- BR-MIGRAR-018 (retry de tabela inclui `DROP TABLE IF EXISTS`; retry de rotina não precisa) — replicado literalmente em `renderRetrySql`.

## Modificadas

- **BR-MIGRAR-016** — mecanismo de geração muda de "3 funções de renderização independentes, síncronas, gravando em disco" para "1 serializador único, sob demanda, persistindo em App DB, servido via HTTP" (decisão de revisão já registrada antes desta feature; esta entrega é a primeira implementação real dela).
- **BR-DESCARTAR-001/002/005** (`discard_log.md`) — confirmadas como definitivamente descartadas: o wizard não tem nenhum ponto de "pausa e pergunta" reativa nem tabela de terminal; tudo é formulário + preview explícito.
