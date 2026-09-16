# Onboarding: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Passo a passo para um humano testar esta feature pela primeira vez.

## Pré-requisitos

1. Node.js ≥ 20 instalado (`package.json#engines`).
2. Um MySQL 5.x acessível (origem) e um MySQL 8.x acessível (destino) — podem ser instâncias de teste/homologação, nunca produção na primeira validação.
3. Variável de ambiente `CREDENTIAL_VAULT_KEY` configurada (chave AES-256 em hex, ver `src/core/credentialVault.ts`): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. `.env` preenchido (ver `.env.example`).

## Passo a passo

1. `npm install`
2. `npm run migrate` — aplica `src/core/db/migrations/001_init.sql` no App DB.
3. `npm run dev` — sobe o backend Fastify (`src/server.ts`).
4. Suba o frontend conforme instruções que o `/reversa-coding` desta feature deixará em `README.md`/`package.json` do cliente web (esta etapa de plano não fixa a stack de frontend).
5. Acesse a tela de perfis de conexão. Crie dois perfis:
   - Um apontando para o MySQL 5.x de teste (origem).
   - Um apontando para o MySQL 8.x de teste (destino).
6. Confirme que a senha não aparece na listagem de perfis (RF-09). Nota (descoberta durante `/reversa-coding`, ver `actions.md` § Notas de execução): o backend não expõe endpoint de edição de perfil nesta entrega, só criação/listagem/exclusão — não há tela de "reabrir para editar" a testar.
7. Inicie o wizard, escolha a feature **rotinas**, selecione os dois perfis criados.
8. Selecione ao menos uma rotina existente na origem (ou "todas").
9. Nas opções, mantenha os defaults (`dropExisting` habilitado).
10. Solicite o preview — confira que as `Issue`s aparecem antes de qualquer confirmação (RF-05).
11. Confirme o job. Anote o `jobId` retornado.
12. Acompanhe a tela de status até `completed` (RF-07).
13. Na tela de resultado, confira os itens processados (RF-08) e baixe/visualize o relatório nos 3 formatos (RF-10 — `json`, `html`, `sql`; `retry` só aparece se houve item com erro).
14. Repita os passos 7–13 trocando a feature para **tabelas**, testando ao menos uma tabela com `copyData` habilitado.
15. **Caso negativo**: repita a seleção de itens (passo 8) incluindo um nome de rotina/tabela inexistente. Confirme que o preview sinaliza o item como aviso, não erro bloqueante, e que o job ainda pode ser confirmado apenas com os itens válidos (cenário 2 de `requirements.md#7`).
16. Tente excluir um perfil de conexão referenciado por um job já criado (passo 7/14). Confirme que a UI trata o erro retornado pelo backend (`FOREIGN KEY ... ON DELETE RESTRICT`) sem quebrar a tela (RF-01).

## Critério de sucesso do onboarding

Todos os 16 passos executam sem erro não tratado na UI, e o relatório final gerado no passo 13 reflete corretamente os itens aplicados/pulados/com erro de cada execução.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-plan` | reversa |
