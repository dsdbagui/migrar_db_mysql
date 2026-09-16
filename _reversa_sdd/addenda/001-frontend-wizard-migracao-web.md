# Adendo: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Cenário: legado (`_reversa_sdd/architecture.md` + `_reversa_sdd/domain.md` como âncora)

## Vigência

Vigente desde 2026-09-16.

## Resumo da entrega

Entrega a interface web (frontend) que faltava na versão Node.js/TypeScript de `migra_db_mysql`: um wizard multi-step (BR-HUMANA-001) para configurar e disparar migrações de rotinas e tabelas MySQL 5.x → 8.x contra a API REST já implementada, mais um endpoint novo de relatório consolidado (`POST`/`GET /jobs/:id/report`, BR-MIGRAR-016) que não existia no backend antes desta feature. 21/21 ações de `actions.md` concluídas.

## Impacto por artefato da extração

| Artefato | Seção | Tipo de impacto | Delta |
|---|---|---|---|
| `_reversa_sdd/c4-components.md` | `#main` (Main Orchestrator, parte interativa: `ask`/`confirm`/fluxo de `main()`) | componente-novo | A pasta `web/` implementa um wizard HTTP de 4 etapas que substitui a interatividade de terminal do legado; ver `_reversa_forward/001-frontend-wizard-migracao-web/legacy-impact.md` para o detalhe completo por arquivo |
| `_reversa_sdd/c4-components.md` | `#report` (Report Generator: `print_summary_table`, `render_html_report`, `save_report`) | componente-novo | `src/features/reports/` reimplementa a geração do relatório como endpoint HTTP sob demanda (`POST`/`GET /jobs/:id/report`), persistindo em `job_reports` em vez de gravar arquivos em disco ao fim de `main()` |
| `_reversa_sdd/architecture.md` | § Integrações externas | contrato-novo | Novo contrato HTTP `POST`/`GET /jobs/:id/report` — o legado só tinha saída de terminal e arquivos locais, nenhum endpoint equivalente |
| `_reversa_sdd/migration/target_business_rules.md` | `#BR-MIGRAR-016` | regra-alterada | Mecanismo de geração dos 3 formatos de relatório consolidado sob um serializador único (`src/features/reports/serializer.ts`); a regra observável (3 formatos funcionais + retry condicional, `BR-MIGRAR-018`) foi preservada |
| `_reversa_sdd/migration/discard_log.md` | `#BR-DESCARTAR-001`, `#BR-DESCARTAR-002`, `#BR-DESCARTAR-005` | regra-removida | Confirmado na implementação: nenhum prompt reativo de terminal nem renderização de tabela `rich` sobrevive na versão web — ver watch items abaixo |

## Regras sob vigilância

- `W001`, `W002`, `W003` — ver `_reversa_forward/001-frontend-wizard-migracao-web/regression-watch.md`

## Fontes

- `_reversa_forward/001-frontend-wizard-migracao-web/requirements.md`
- `_reversa_forward/001-frontend-wizard-migracao-web/roadmap.md`
- `_reversa_forward/001-frontend-wizard-migracao-web/legacy-impact.md`
- `_reversa_forward/001-frontend-wizard-migracao-web/regression-watch.md`
- `_reversa_forward/001-frontend-wizard-migracao-web/progress.jsonl`
