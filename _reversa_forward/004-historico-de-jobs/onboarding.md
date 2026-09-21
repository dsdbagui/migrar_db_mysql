# Onboarding: Histórico de jobs

> Identificador: `004-historico-de-jobs`
> Data: `2026-09-21`
> Passo a passo para um humano testar a feature pela primeira vez (após a implementação — `/reversa-coding`).

## Pré-requisitos

- App DB acessível (MySQL 8.x com o schema já criado por `001_init.sql`/`002_add_job_error_message.sql`).
- `.env` configurado (variáveis de conexão do App DB, cofre de credenciais) — mesmo setup já usado pelas features `001`-`003`.

## Passo a passo

1. Rodar a migration nova:
   ```bash
   npm run migrate
   ```
   Confere que `migration_jobs` ganhou a coluna `created_at` (ex.: `DESCRIBE migration_jobs;` no MySQL client).

2. Subir o backend e o frontend:
   ```bash
   npm run dev          # backend, na raiz do projeto
   cd web && npm run dev  # frontend, outro terminal
   ```

3. **Cenário "histórico vazio"** (se o App DB for novo, sem nenhum job ainda):
   - Abrir o frontend no navegador, ir em `#/jobs` (ou clicar em "Histórico" na nav).
   - Confirmar que aparece uma mensagem de "nenhum job encontrado" (ou equivalente), sem erro de console/tela em branco.

4. **Cenário "3 jobs, 2 completed 1 failed"**:
   - Criar um perfil de conexão de origem e um de destino em `#/profiles`.
   - Disparar 2-3 jobs pelo wizard (`#/wizard/step1`) — pelo menos um com parâmetros que causem falha proposital (ex.: tabela/rotina inexistente no `select`) para ver o caso `failed` com `errorMessage`.
   - Esperar cada job chegar a um status terminal (acompanhar em `#/jobs/:feature/:id`, ou só aguardar).
   - Abrir `#/jobs` — confirmar:
     - Os jobs aparecem, o mais recente primeiro.
     - Cada linha mostra feature, status, datas, quem disparou, e os labels de perfil (não os UUIDs).
     - Clicar num item navega para `#/jobs/:feature/:id` (tela de acompanhamento já existente) e carrega o job correto.

5. **Verificação direta do contrato** (sem UI, útil para depurar):
   ```bash
   curl http://localhost:3000/jobs | jq
   curl "http://localhost:3000/jobs?feature=tables&status=completed" | jq
   ```
   Confirma a forma da resposta descrita em `interfaces/get-jobs.md` (array no nível raiz, campos `sourceProfileLabel`/`targetProfileLabel` resolvidos).

6. **Teste automatizado** (se já implementado):
   ```bash
   npm test -- tests/features/jobs
   ```

## O que NÃO testar nesta entrega

- Paginação/cursor — não existe (RN da NFR de Escopo); com mais de 50 jobs, os mais antigos ficam inacessíveis pela listagem por design, não é bug.
- Filtro `feature`/`status` na UI — o contrato aceita, mas não há campo de filtro na tela `jobHistory.ts` nesta entrega (D-04 do `roadmap.md`), só testável via `curl`/API direta.
