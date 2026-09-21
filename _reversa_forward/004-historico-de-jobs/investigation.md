# Investigação: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`

## Pesquisa de fundo

Não há biblioteca externa nem padrão de mercado a avaliar aqui — é uma listagem simples sobre uma tabela que já existe (`migration_jobs`), com paginação explicitamente descartada pelo próprio requirements (seção 6, NFR de Escopo/paginação). A única pergunta técnica real era "como ordenar por recência sem uma coluna confiável para isso", já resolvida em `/reversa-clarify` antes deste plano (RN-01).

## Alternativas avaliadas para a fonte de ordenação (RN-01)

| Alternativa | Por que foi descartada |
|---|---|
| Ordenar por `started_at` | `NULL` para jobs `pending` que nunca chegaram a rodar — um job recém-criado ficaria fora de ordem (ou exigiria um `ORDER BY started_at DESC NULLS FIRST`, que o MySQL não suporta nativamente sem `CASE`) |
| Ordenar por `id` (UUID, `CHAR(36)`) | UUIDs gerados por `randomUUID()` (`jobRunner.ts:78`) não são ordenáveis por tempo (não são UUIDv7/ULID) — ordenar por `id` não corresponde a ordenar por recência |
| Adicionar `created_at` (escolhida) | Mesmo padrão já usado em duas tabelas do próprio schema (`connection_profiles`, `job_reports`) — zero ambiguidade de comportamento, `DEFAULT CURRENT_TIMESTAMP` preenche automaticamente linhas novas sem exigir mudança em `createJob()` |

## Alternativas avaliadas para o JOIN de labels (RF-02)

| Alternativa | Por que foi descartada |
|---|---|
| Retornar só `sourceProfileId`/`targetProfileId` e resolver o label no frontend (uma chamada a mais a `GET /connection-profiles`) | Decidido contra em `/reversa-clarify` (Esclarecimentos, pergunta 3) — o operador escolheu explicitamente a opção "JOIN no backend, label já resolvido na listagem", que evita uma segunda chamada de rede só para popular a tabela |
| `INNER JOIN` | Excluiria jobs de `collation_fix` da listagem (não têm `source_profile_id`) — ver D-03 do `roadmap.md` |
| `LEFT JOIN` (escolhida) | Cobre os dois casos (perfil de origem ausente para `collation_fix`; qualquer perfil eventualmente removido no futuro, se essa operação existir — hoje `deleteProfile` é bloqueado por `ON DELETE RESTRICT` enquanto o perfil estiver em uso, `profileRoutes.ts:44-54`, então na prática o label nunca deveria vir `NULL` para um job existente, mas o `LEFT JOIN` é a escolha correta de qualquer forma para não depender dessa garantia indiretamente) |

## Padrões aplicáveis já presentes no código

- Migration idempotente (`ADD COLUMN IF NOT EXISTS`), já estabelecida por `002_add_job_error_message.sql` — reaproveitada sem alteração de padrão.
- Client HTTP fino com `ApiResult<T>` (`web/src/api.ts:12-39`) — o método novo `listJobs()` segue a mesma forma dos demais (`listProfiles`, `getJobStatus`).
- Roteador hash mínimo (`web/src/router.ts`) — a rota `/jobs` é só mais uma chamada a `addRoute`, sem padrão novo.

## Nenhuma fonte externa consultada

Esta feature não introduz dependência nova nem toca em nenhuma integração externa (MySQL origem/destino) — o escopo é inteiramente App DB + API interna + frontend já existentes.
