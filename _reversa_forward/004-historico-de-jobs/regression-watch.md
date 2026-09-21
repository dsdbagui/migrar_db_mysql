# Regression Watch: Histórico de jobs

> Identificador: `004-historico-de-jobs`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|-------------------------------|----------------------|---------------------|
| W001 | `legacy-impact.md § Arquivos afetados` (migration `003`); `data-delta.md` | `migration_jobs.created_at` existe (`TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`) e é a coluna usada para ordenar `GET /jobs` — nunca `started_at` (que é `NULL` para jobs `pending`) | presença + redação | Uma re-extração futura não encontra `created_at` em `migration_jobs`, ou encontra `GET /jobs` ordenando por outra coluna |
| W002 | `legacy-impact.md § Diff conceitual` (jobs — feature transversal); `interfaces/get-jobs.md` | `GET /jobs` usa `LEFT JOIN` (não `INNER JOIN`) com `connection_profiles`, para não excluir jobs de `collation_fix` (sem `source_profile_id`) da listagem | presença | Uma edição futura troca para `INNER JOIN` (ex.: durante uma refatoração que não conhece o motivo) — jobs de `collation_fix` desaparecem silenciosamente de `GET /jobs`, sem nenhum teste quebrando a menos que o caso "job de collation_fix aparece com sourceProfileLabel null" continue em `tests/features/jobs/routes.test.ts` |
| W003 | `legacy-impact.md § Arquivos afetados` (`GET /jobs`) | `GET /jobs` nunca retorna mais de 50 itens (sem paginação real nesta entrega) | presença | Uma mudança futura remove o `LIMIT 50` sem introduzir paginação real, alterando o contrato sem atualizar `interfaces/get-jobs.md` |

## Observações

<!-- Itens sem peso de regressão: infraestrutura nova sem regra 🟢 de domain.md de origem, ou comportamento que ainda não foi confirmado por uma extração completa. -->

- **RF-01 a RF-04** (`_reversa_forward/004-historico-de-jobs/requirements.md`): endpoint `GET /jobs`, campos com labels resolvidos, tela de histórico, link de navegação. Todos implementados e cobertos por `tests/features/jobs/routes.test.ts` (9 testes novos verdes), mas ainda não confirmados por uma extração reversa (`/reversa`) completa sobre o código Node/TS/web atual — ganham peso de regressão formal quando uma futura re-extração os capturar.
- **Filtros opcionais `?feature=`/`?status=` de `GET /jobs`** (D-04 do `roadmap.md`): decisão de nomenclatura inferida (🟡), não uma regra confirmada — sem UI correspondente nesta entrega, só testável via chamada direta ao endpoint.
- **Ordem do link "Histórico" na `<nav>`** (D-06 do `roadmap.md`): decisão de posicionamento sem sinal forte no `requirements.md` (🟡) — não é um comportamento a vigiar por regressão, é uma escolha estética reversível sem custo.
- **Jobs criados antes desta migration recebem todos o mesmo `created_at`** (o momento em que a `ALTER TABLE` correu) — limitação conhecida e documentada (`roadmap.md § Riscos`), não uma regressão a detectar, mas vale registrar aqui para não ser redescoberta como "bug" numa auditoria futura.

## Histórico de re-extrações

_(vazio — preenchido pelo agente reverso na próxima execução de `/reversa` sobre este código)_

## Arquivadas

_(vazio)_
