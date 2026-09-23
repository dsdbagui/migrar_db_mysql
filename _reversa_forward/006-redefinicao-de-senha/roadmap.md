# Roadmap: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Requirements: `_reversa_forward/006-redefinicao-de-senha/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

A feature é um delta pequeno sobre o módulo de autenticação entregue pela `005` (`_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md`), sem nenhuma mudança de schema: `app_users.password_hash` e `app_sessions` já comportam tudo.

- **Script `create-user`:** deixa de ler a senha de `argv`. Com terminal interativo, lê sem eco e com confirmação (modo raw do `node:readline`/`process.stdin`, sem dependência nova). Sem terminal, lê a primeira linha de stdin. Ganha a flag `--reset <username>`.
- **Troca de senha e sessões:** vivem numa função única, `changePassword(userId, novaSenha)`, em `appUsers.ts`. Ela atualiza o hash e apaga todas as sessões do usuário **na mesma transação** e é usada pela CLI e pela API.
- **Política de 8 caracteres:** vira um módulo próprio (`passwordPolicy.ts`), aplicado nos quatro caminhos de gravação (`create-user`, `--reset`, `POST /users`, rota nova). **Nunca** é aplicada no login, para não trancar do lado de fora quem já tem senha curta.
- **API:** ganha `POST /users/me/password` (só a própria senha, exigindo a senha atual).
- **Frontend:** ganha a tela "Alterar senha".

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Nenhum princípio formal a verificar. n/a.

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Leitura de senha no terminal com `process.stdin.setRawMode(true)`, tratando caractere a caractere: Enter conclui, Backspace apaga, Ctrl+C aborta com código 130, e nada é ecoado. Módulo novo `src/core/db/promptPassword.ts` | Zero dependência nova (mesma filosofia de stack mínima da `005`, D-03). O modo raw evita que o terminal ecoe e dá controle exato sobre os bytes lidos, sem truncar nem interpretar nada (RF-03) | Pacote `read`/`inquirer`: dependência nova para ~40 linhas. `readline.question` sobrescrevendo `_writeToOutput`: depende de API interna não documentada do Node | 🟢 |
| D-02 | Sem TTY (`process.stdin.isTTY` falso), lê stdin inteiro e usa só a **primeira linha**, removendo apenas o `\n`/`\r\n` final. Sem confirmação. Stdin vazio ou primeira linha vazia é erro | Contrato simples para scripts de deploy (`printf '%s\n' "$SENHA" \| npm run create-user -- <user>`). Ler só a primeira linha evita que um `\n` a mais vire parte da senha | Ler de variável de ambiente (`APP_USER_PASSWORD`): fica visível em `/proc/<pid>/environ` e no ambiente herdado por processos filhos. Arquivo de senha (`--password-file`): mais superfície sem pedido do operador | 🟢 |
| D-03 | Interface do script: `npm run create-user -- <username>` cria e `npm run create-user -- --reset <username>` redefine. Qualquer outra forma (senha como argumento, argumentos a mais, flag desconhecida) é erro com mensagem de uso e código 2 | Mantém um único script, como pedido ("opção no createUser"). Código 2 é a convenção de erro de uso de linha de comando, distinto de 1 (falha de execução) | Script separado `reset-password`: o operador pediu opção no mesmo script. Aceitar a senha como argumento com aviso: reabre o defeito original (RF-04) | 🟢 |
| D-04 | `appUsers.changePassword(userId, newPassword)` numa transação explícita (`getConnection()` + `beginTransaction`): `UPDATE app_users SET password_hash = ?` e `DELETE FROM app_sessions WHERE user_id = ?`, com `commit` ou `rollback` | RNF de atomicidade: uma senha trocada com sessões antigas vivas anularia RN-03. É a primeira transação explícita do App DB. Hoje tudo é autocommit por `pool.query` | Dois `pool.query` soltos: janela de inconsistência se o segundo falhar. `ON UPDATE` via trigger: lógica escondida no banco, fora do padrão do projeto (nenhuma trigger hoje) | 🟢 |
| D-05 | `src/core/passwordPolicy.ts` com `validateNewPassword(pw): string \| null`, que conta caracteres por code point (`[...pw].length >= 8`) e devolve a mensagem de erro única do RF-10. Aplicada em `createAppUser`/`changePassword`, **não** em `verifyPassword` nem no `POST /login` | Um ponto único garante a mesma regra e a mesma mensagem nos quatro caminhos. Contar code points faz `"ação1234"` ter 8 caracteres, como o usuário espera, e não 10 bytes | Validar em cada rota ou script separadamente: divergência garantida com o tempo. Aplicar no login: trancaria senhas curtas já existentes, contrariando RN-05 ("não revalida") | 🟢 |
| D-06 | Rota `POST /users/me/password`, corpo `{ currentPassword, newPassword }`. O usuário vem de `request.userId` (sessão), nunca do corpo nem da URL. Senha atual errada responde `403` e a resposta de sucesso é `204` com o cookie limpo | RN-04: só a própria senha, e o `me` torna isso estrutural (não há como apontar outro usuário). `403` e não `401` porque `web/src/api.ts` redireciona todo `401` ao login (feature `005`), e o usuário perderia a tela com a mensagem de erro | `PUT /users/:id/password` com checagem `id === userId`: superfície para erro de autorização futuro. `401` para senha atual errada: conflita com o redirecionamento global do frontend | 🟢 |
| D-07 | A verificação da senha atual reutiliza `verifyPassword` (scrypt) e exige um `findUserById` novo em `appUsers.ts` | Mesmo algoritmo e mesmos parâmetros do login. Não existe busca por id hoje, só `findUserByUsername` | Buscar pelo `request.username`: funcionaria, mas o id é a identidade estável da sessão | 🟢 |
| D-08 | Tela `web/src/screens/changePassword.ts`, rota `#/account/password`, link "Alterar senha" na `<nav>` de `web/index.html`. A confirmação da nova senha e o mínimo de 8 caracteres são checados no cliente antes de chamar a API, com o servidor como autoridade. Com sucesso, limpa o estado do wizard (`resetWizard`) e navega para `#/login` | Mesmo padrão da tela de login (`005`, T026) e do link "Sair" (T032). A checagem no cliente só evita ida e volta, a regra real é a do servidor | Modal sobre a tela atual: o projeto não tem componente de modal (DOM direto, sem framework de UI) | 🟢 |
| D-09 | Logs: `logger.ok("Senha redefinida", { username, canal: "cli" \| "api", sessoesEncerradas })` e `logger.warn` para tentativa com senha atual errada. Nunca a senha nem o hash | RNF de observabilidade e W004 da `005` | Log sem canal: não distinguiria uso operacional (VM) de autoatendimento | 🟢 |

## 4. Premissas

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| `npm run create-user` repassa o TTY do terminal ao processo `tsx`, de modo que `process.stdin.isTTY` é verdadeiro quando o operador roda o comando à mão | § 6, RNF Operação (🟡) | Se o npm não repassar, o script cairia no modo stdin e ficaria esperando uma linha sem prompt. Mitigação: validar em `/reversa-coding` com um pseudo-terminal (`script -q -c ...`) e, se falhar, documentar `npx tsx --env-file=.env src/core/db/createUser.ts` como forma interativa |

Nenhuma premissa vem de `[DÚVIDA]` não resolvida: todas foram resolvidas em `/reversa-clarify`.

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| Core — Autenticação (entregue pela `005`) | `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md#Impacto por artefato da extração` | regra-alterada | `appUsers.ts` ganha `findUserById` e `changePassword` (transacional, encerra sessões). `passwordPolicy.ts` novo, com mínimo de 8 caracteres |
| Core — bootstrap operacional (`src/core/db/createUser.ts`, `005`) | mesmo adendo | regra-alterada | Senha deixa de vir de `argv` (terminal sem eco ou stdin). Nova flag `--reset`. `promptPassword.ts` novo |
| API / Wizard | `_reversa_sdd/migration/target_architecture.md#Componentes` (API / Wizard) | contrato-novo | `POST /users/me/password` |
| API / Wizard | mesmo | contrato-alterado | `POST /users` passa a recusar com `400` senhas de menos de 8 caracteres |
| Cliente web (`001`/`005`) | `_reversa_sdd/addenda/001-frontend-wizard-migracao-web.md` | componente-novo | Tela "Alterar senha" e link no menu |

## 6. Delta no modelo de dados

- Resumo das mudanças: **nenhuma mudança de schema**. Só muda o comportamento: `app_users.password_hash` passa a ser atualizado (antes só inserido) e `app_sessions` passa a ter apagamento em massa por `user_id`. Não há migration nova.
- Detalhe completo em: `_reversa_forward/006-redefinicao-de-senha/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `POST /users/me/password` (novo) | HTTP | `_reversa_forward/006-redefinicao-de-senha/interfaces/troca-de-senha.md` |
| `POST /users` (política de senha) | HTTP | `_reversa_forward/006-redefinicao-de-senha/interfaces/criacao-de-usuario.md` |
| `npm run create-user` (uso alterado, `--reset` novo) | CLI | `_reversa_forward/006-redefinicao-de-senha/interfaces/cli-create-user.md` |

## 8. Plano de migração

1. Sem migration de banco: nenhuma alteração de schema.
2. Comunicar a mudança de uso do `create-user` a quem mantém o deploy: o formato `create-user -- <usuario> <senha>` deixa de funcionar e passa a dar erro de uso. `docs/seguranca-e-stack.md` é atualizado nesta feature. `docs/deploy-hermes.md` **não está no `allowedPaths`**, ver Riscos.
3. Senhas existentes com menos de 8 caracteres continuam funcionando no login. O usuário só é obrigado a seguir a política na próxima troca.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| O npm não repassa o TTY e o modo interativo não funciona via `npm run` (premissa da seção 4) | médio | baixo | Teste com pseudo-terminal no coding. Alternativa documentada com `npx tsx` direto |
| Um script de deploy existente usa o formato antigo `create-user -- <usuario> <senha>` e passa a falhar | médio | baixo (só uso manual conhecido, `docs/deploy-hermes.md`) | Mensagem de erro de uso mostra o formato novo com stdin. Falhar alto é melhor que gravar senha errada em silêncio (o defeito original) |
| `docs/deploy-hermes.md` continua descrevendo o formato antigo | baixo | alto | Fora do `allowedPaths` atual. Registrar como pendência para o usuário liberar ou editar à mão. `docs/seguranca-e-stack.md` é atualizado |
| Trocar a própria senha derruba as sessões em outros navegadores ou abas do mesmo usuário | baixo | alto (é o comportamento pedido) | Decisão explícita do operador (RN-03). A tela informa antes de confirmar que todas as sessões serão encerradas |
| Força bruta da senha atual via `POST /users/me/password` com uma sessão roubada | médio | baixo | Exige sessão válida e cada tentativa paga o custo do scrypt. Sem rate limiting (limitação já registrada em `docs/seguranca-e-stack.md` para `/login`) |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] `cross-check.md` (se executado) sem CRITICAL nem HIGH
- [ ] `regression-watch.md` gerado
- [ ] Re-extração reversa executada e sem regressão vermelha (recomendado, não obrigatório)

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
