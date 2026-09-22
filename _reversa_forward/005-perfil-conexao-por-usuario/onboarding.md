# Onboarding: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`
> Passo a passo para um humano testar a feature pela primeira vez (após a implementação — `/reversa-coding`).

## Pré-requisitos

- App DB acessível (MySQL 8.x com o schema já criado por `001_init.sql`–`003_add_migration_jobs_created_at.sql`).
- `.env` configurado (`CREDENTIAL_VAULT_KEY`, conexão do App DB) — mesmo setup das features anteriores.
- Pelo menos um MySQL de teste (origem e/ou destino) alcançável, para testar o reaproveitamento de perfil entre bancos diferentes.

## ⚠️ Antes de rodar a migration em qualquer ambiente com dados reais

A migration `005_connection_profiles_owner.sql` **apaga todos os `connection_profiles` existentes** (decisão do operador em `/reversa-clarify`, ver `requirements.md#9`). Se este onboarding for seguido contra a VM `hermes` (`docs/deploy-hermes.md`) ou qualquer ambiente com perfis reais cadastrados, confirme com quem usa esses perfis antes — eles precisarão ser recriados do zero, já autenticados, depois desta migration.

## Passo a passo

1. Instalar a dependência nova do backend (D-02 do `roadmap.md`):
   ```bash
   npm install @fastify/cookie
   ```

2. Rodar as migrations novas:
   ```bash
   npm run migrate
   ```
   Confere que `app_users`, `app_sessions` existem (`SHOW TABLES;`), que `connection_profiles` perdeu `database_name` e ganhou `user_id` (`DESCRIBE connection_profiles;`), e que `migration_jobs` ganhou `source_database`/`target_database`.

3. Criar o primeiro usuário (D-09 — não existe tela para isso, é intencional):
   ```bash
   npm run create-user -- operador senha-de-teste
   ```
   Confirma que o comando reporta sucesso e que existe uma linha em `app_users`.

4. Subir backend e frontend:
   ```bash
   npm run dev            # backend, na raiz do projeto
   cd web && npm run dev  # frontend, outro terminal
   ```

5. **Cenário: acesso sem login é recusado**
   - Abrir o frontend no navegador sem ter feito login ainda.
   - Confirmar que qualquer tela protegida (`#/profiles`, `#/jobs`, wizard) redireciona para a tela de login, ou que uma chamada direta (`curl http://localhost:3000/connection-profiles`) retorna `401` sem cookie.

6. **Cenário: login com credenciais corretas e incorretas**
   - Tentar logar com usuário/senha errados — confirmar mensagem de erro genérica (não distinguir "usuário não existe" de "senha errada").
   - Logar com `operador`/`senha-de-teste` (passo 3) — confirmar acesso às telas protegidas.

7. **Cenário: perfil de conexão sem campo de banco, privado ao dono**
   - Em `#/profiles`, criar um perfil — confirmar que não há mais campo de banco no formulário.
   - Criar um segundo usuário (`npm run create-user -- operador2 outra-senha`, ou via `POST /users` autenticado como `operador`), logar como ele — confirmar que ele **não** vê o perfil criado pelo `operador` em `#/profiles`.

8. **Cenário: reaproveitar o mesmo perfil em bancos diferentes**
   - Logado como `operador`, ir ao wizard (`#/wizard/step1`) — confirmar que a Etapa 1 agora pede banco de origem (e de destino, se aplicável) além dos perfis.
   - Rodar uma migração de `tables`/`routines` informando o banco `teste_a`.
   - Voltar ao wizard, escolher o **mesmo** perfil de origem/destino, mas informar `teste_b`.
   - Confirmar que os dois jobs completam contra os bancos corretos (checar `information_schema`/dados no MySQL de teste, ou os itens listados na tela de resultado de cada job), sem precisar de um segundo perfil cadastrado.

9. **Cenário: logout encerra a sessão**
   ```bash
   curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/login -d '{"username":"operador","password":"senha-de-teste"}' -H 'Content-Type: application/json'
   curl -i -b cookies.txt -X POST http://localhost:3000/logout
   curl -i -b cookies.txt http://localhost:3000/connection-profiles   # deve voltar 401
   ```

10. **Teste automatizado** (se já implementado):
    ```bash
    npm test
    ```

## O que NÃO testar nesta entrega

- Reset/recuperação de senha — fora de escopo (`requirements.md` RNF Escopo); um usuário sem senha correta precisa de intervenção manual no banco.
- Rotas de `config`/`collation_fix` — não existem no backend web ainda (`requirements.md` RF-10, escopo restrito a `tables`/`routines`).
- Sessão renovando automaticamente com uso contínuo ("sliding expiration") — a sessão expira exatamente 2h após o login, mesmo com atividade (ver `interfaces/autenticacao.md`).
- `GET /jobs` (histórico, feature `004`) mostrando qual banco cada job tocou — os dados existem em `migration_jobs.source_database`/`target_database`, mas a tela/endpoint de histórico não foi alterada por esta feature (ver risco registrado em `roadmap.md`).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
