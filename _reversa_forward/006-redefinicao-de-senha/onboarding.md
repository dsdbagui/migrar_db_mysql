# Onboarding: Entrada segura de senha no create-user e redefinição de senha

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Passo a passo para testar a feature pela primeira vez, depois do `/reversa-coding`.

## Pré-requisitos

- Feature `005` aplicada (migrations `004`–`006` rodadas, `npm run migrate`). Esta feature **não** tem migration nova.
- Rodar os comandos a partir da raiz da worktree (`~/projects/migrar_db_mysql-web-stack`), onde está o `.env`.

## Validação já feita no `/reversa-coding` (T013)

Premissa do `roadmap.md` § 4 **confirmada** em 2026-09-23: `npm run create-user` repassa o terminal ao script. Sob um pseudo-terminal real, com a senha `` p@ss w$rd!#&;`ç ``, o script pediu a senha e a confirmação sem ecoar nada, criou o usuário e o login funcionou com a senha exata. O mesmo valeu para stdin (`printf ... |`) e para o `--reset`, que encerrou 2 sessões reais (as duas passaram a receber 401). Ctrl+C terminou com código 130 sem gravar nada, e nenhuma senha apareceu nos logs. Não é preciso usar `npx tsx` diretamente.

## Passo a passo

1. **Criar usuário digitando a senha** (terminal interativo):
   ```bash
   npm run create-user -- teste006
   ```
   Digite uma senha com caracteres especiais, por exemplo `p@ss w$rd!#&`. Nada deve aparecer na tela. Repita na confirmação.

2. **Confirmação diferente**: rode de novo com outro username e digite senhas diferentes. Esperado: erro, código de saída `1`, nenhum usuário criado.

3. **Senha curta**: tente uma senha de 7 caracteres. Esperado: recusa com a mensagem da política, nada gravado.

4. **Formato antigo recusado**:
   ```bash
   npm run create-user -- teste006b minhasenha; echo "saída=$?"
   ```
   Esperado: mensagem de uso e `saída=2`, sem criar usuário.

5. **Por stdin (como num deploy)**:
   ```bash
   printf '%s\n' 'outra s3nh@ $ecreta' | npm run create-user -- teste006c
   ```
   Depois, faça login na aplicação com `teste006c` e exatamente `outra s3nh@ $ecreta`.

6. **Redefinir pela linha de comando**:
   - Entre na aplicação como `teste006`, crie um perfil de conexão e deixe a aba aberta.
   - No terminal: `npm run create-user -- --reset teste006` e digite uma senha nova.
   - Esperado: mensagem com o número de sessões encerradas. A aba aberta, na próxima ação, volta ao login. A senha antiga não entra mais, a nova entra, e o perfil de conexão continua lá.

7. **Redefinir usuário inexistente**: `npm run create-user -- --reset fantasma`. Esperado: erro, código `1`.

8. **Alterar a própria senha pela tela**:
   - Logado em **dois** navegadores com o mesmo usuário, abra "Alterar senha" no menu de um deles.
   - Senha atual errada: aparece uma mensagem e você continua logado.
   - Senha atual certa, nova com 8 ou mais caracteres, confirmada: você volta ao login. O outro navegador, na próxima ação, também volta ao login.

9. **Pela API** (opcional):
   ```bash
   curl -i -c c.txt -X POST http://localhost:3000/login -H 'Content-Type: application/json' -d '{"username":"teste006","password":"<atual>"}'
   curl -i -b c.txt -X POST http://localhost:3000/users/me/password -H 'Content-Type: application/json' -d '{"currentPassword":"errada","newPassword":"12345678"}'   # 403
   curl -i -b c.txt -X POST http://localhost:3000/users/me/password -H 'Content-Type: application/json' -d '{"currentPassword":"<atual>","newPassword":"curta"}'      # 400
   ```
   Com `SESSION_COOKIE_SECURE=false` no `.env` se testar por `curl` em HTTP (o curl não reenvia cookie `Secure` por HTTP).

10. **Testes automatizados**: `npm test`.

11. **Limpeza**: apague os usuários de teste no App DB (`DELETE FROM app_users WHERE username LIKE 'teste006%'`), lembrando que isso apaga também os perfis deles.

## O que NÃO testar nesta entrega

- Redefinir a senha de **outro** usuário pela tela ou pela API: fica só no script da VM (RN-04).
- Recuperação de senha por e-mail ou link: não existe.
- Revalidação de senhas curtas antigas: senhas já gravadas continuam entrando até a próxima troca.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
