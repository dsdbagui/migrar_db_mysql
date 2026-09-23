# Requirements: Entrada segura de senha no create-user e redefinição de senha (CLI e API)

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Hoje `npm run create-user -- <username> <senha>` recebe a senha como argumento de linha de comando. O shell interpreta caracteres especiais (`$`, `#`, `!`, `&`, espaço…) antes de a senha chegar ao script, que ainda ignora silenciosamente argumentos a mais. O resultado já aconteceu em uso real: uma senha gravada truncada sem nenhum aviso. Além disso, não existe forma de trocar a senha de um usuário da aplicação: a feature `005` deixou reset e recuperação fora do escopo, e a única saída é apagar o usuário, o que apaga também os perfis de conexão dele (`ON DELETE CASCADE`).

Esta feature faz três coisas:
- **Entrada de senha segura no script:** a senha é pedida sem eco e com confirmação no terminal, ou lida de stdin quando não houver terminal interativo (scripts de deploy).
- **Opção de redefinição de senha no mesmo script.**
- **Rota de API e tela web para o usuário trocar a própria senha,** informando a senha atual. Toda redefinição encerra as sessões ativas do usuário afetado.

Criação e redefinição passam a exigir senha de no mínimo 8 caracteres.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/permissions.md#Contexto` | O legado CLI não tem login, sessão nem papéis ("quem roda o script tem acesso a todas as opções"). Não há precedente de gestão de senha de aplicação no legado | 🟢 |
| `_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md#Impacto por artefato da extração` | A versão web ganhou usuários (`app_users`, hash scrypt), sessões de 2h (`app_sessions`) e cadastro fechado. O primeiro usuário nasce por `npm run create-user` e os demais por `POST /users` (exige sessão). Continua existindo um único papel, sem RBAC entre usuários | 🟢 |
| `_reversa_forward/005-perfil-conexao-por-usuario/requirements.md` § 6 (RNF Escopo) | "Recuperação/reset de senha do usuário da aplicação fica fora do escopo desta entrega — sem essa funcionalidade, um usuário que esquece a senha precisa de intervenção manual no banco." Esta feature fecha essa lacuna | 🟢 |
| `src/core/db/createUser.ts` (entregue pela `005`) | `const [username, password] = process.argv.slice(2)`. A senha vem de `argv` e argumentos excedentes são descartados sem erro, o que explica a senha truncada relatada pelo operador em 2026-09-23 | 🟢 |
| `src/core/appUsers.ts`, `src/core/passwordHash.ts` (entregues pela `005`) | `createAppUser` e `hashPassword` (scrypt N=2¹⁷, parâmetros gravados junto do hash) são o caminho único de gravação de senha. Não existe função de atualização de senha | 🟢 |
| `src/core/sessionStore.ts` (entregue pela `005`) | Sessões em `app_sessions` com FK para `app_users`. Hoje só existe `deleteSession(id)` (uma sessão por vez) | 🟢 |
| `_reversa_forward/005-perfil-conexao-por-usuario/regression-watch.md` (W001, W004) | Toda rota exceto `/login` e `/health` exige sessão (W001). Senhas nunca saem em claro em resposta HTTP nem em log (W004). A rota nova precisa respeitar os dois | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador de infraestrutura (acesso SSH à VM) | Criar o primeiro usuário ou recuperar o acesso de alguém que esqueceu a senha, sem depender de sessão na aplicação | Roda `npm run create-user` na VM, digita a senha sem que ela apareça na tela nem fique no histórico do shell, ou redefine a senha de um usuário existente sem apagá-lo |
| Script de deploy (sem terminal interativo) | Provisionar um usuário automaticamente | Passa a senha por stdin (`printf '%s\n' "$SENHA" \| npm run create-user -- <usuario>`) sem que ela apareça em `argv` nem na lista de processos |
| Usuário autenticado da aplicação | Trocar a própria senha | Abre "Alterar senha" no menu, informa a senha atual e a nova. Todas as sessões dele, inclusive a atual, são encerradas e ele volta ao login para entrar com a senha nova |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** A senha de usuário da aplicação nunca é aceita como argumento de linha de comando. Ela vem do terminal (sem eco, com confirmação) ou de stdin quando não houver terminal interativo. 🟢
   - Origem: `src/core/db/createUser.ts` (entregue pela `005`, senha em `argv`).
   - Tipo: alterada
2. **RN-02:** A senha de um usuário da aplicação pode ser redefinida, tanto pela linha de comando (na VM, sem sessão) quanto por uma rota da API (com sessão). A redefinição mantém o usuário, o `id` e os perfis de conexão dele. Só o hash da senha muda. 🟢
   - Origem: `_reversa_forward/005-perfil-conexao-por-usuario/requirements.md` § 6 (reset fora do escopo da `005`).
   - Tipo: nova
3. **RN-03:** Toda redefinição de senha, por CLI ou por API, encerra imediatamente todas as sessões ativas do usuário cuja senha mudou. 🟢
   - Origem: nenhuma. Decisão do operador em 2026-09-23 (argumento desta feature).
   - Tipo: nova
4. **RN-04:** Pela API, cada usuário só troca a **própria** senha, e precisa informar a senha atual. Redefinir a senha de **outro** usuário, inclusive de quem esqueceu a própria, só é possível pelo script na VM. Continua existindo um único papel, sem RBAC (`_reversa_sdd/addenda/005-perfil-conexao-por-usuario.md`). 🟢
   - Origem: decisão do operador em `/reversa-clarify`, 2026-09-23.
   - Tipo: nova
5. **RN-05:** Toda senha de usuário da aplicação, na criação e na redefinição, por CLI ou por API, tem no mínimo 8 caracteres. Senhas já gravadas antes desta feature não são revalidadas: a regra vale só na próxima gravação. 🟢
   - Origem: decisão do operador em `/reversa-clarify`, 2026-09-23. Substitui a regra "não vazia" da `005` (`src/core/authRoutes.ts`, `readCredentials`).
   - Tipo: alterada

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Em terminal interativo, `npm run create-user -- <username>` pede a senha sem exibi-la (sem eco) e pede a confirmação da mesma forma | Must | Os caracteres digitados não aparecem na tela. Senhas diferentes na confirmação abortam sem gravar nada, com código de saída ≠ 0 | 🟢 |
| RF-02 | Sem terminal interativo (stdin não é TTY), o script lê a senha da primeira linha de stdin, sem pedir confirmação | Must | `printf '%s\n' 'p@ss w$rd!#&' \| npm run create-user -- <usuario>` grava exatamente `p@ss w$rd!#&` (verificável por login com essa senha). Stdin vazio aborta com erro e código ≠ 0 | 🟢 |
| RF-03 | A senha lida (terminal ou stdin) é usada byte a byte, sem interpretação de caracteres especiais, sem truncamento e sem remoção de espaços internos. Só a quebra de linha final é descartada | Must | Uma senha com espaço, `$`, `#`, `!`, `&`, `;`, `` ` `` e acentos permite login depois de gravada pelos dois caminhos (terminal e stdin) | 🟢 |
| RF-04 | O script recusa com erro qualquer argumento de senha na linha de comando e qualquer argumento excedente, em vez de ignorá-los | Must | `npm run create-user -- usuario senha` termina com erro orientando o novo uso e código ≠ 0, sem gravar nada | 🟢 |
| RF-05 | O script ganha uma opção de redefinição de senha de um usuário existente, com a mesma entrada de senha de RF-01 a RF-03 | Must | Após a redefinição, o login com a senha antiga falha e com a nova funciona. O `id` do usuário e os perfis de conexão dele continuam existindo | 🟢 |
| RF-06 | A redefinição via script para um username inexistente termina com erro, sem criar usuário | Must | Mensagem de erro clara, código ≠ 0, nenhuma linha nova em `app_users` | 🟢 |
| RF-07 | Uma rota da API permite ao usuário da sessão trocar a própria senha, informando a senha atual e a nova (RN-04). Exige sessão válida (middleware global da `005`). A rota não aceita indicar outro usuário | Must | Sem sessão, `401`. Senha atual incorreta, `403`, sem alterar nada (não `401`, que o frontend trata como sessão expirada). Senha nova ausente ou fora da política (RN-05), `400`. Sucesso troca o hash | 🟢 |
| RF-08 | Toda redefinição (RF-05 e RF-07) apaga todas as linhas de `app_sessions` do usuário afetado | Must | Um cookie de sessão emitido antes da redefinição passa a receber `401` em qualquer rota protegida logo depois dela | 🟢 |
| RF-09 | Na troca pela API, a sessão usada na chamada também é encerrada (é sempre do próprio usuário, RN-04) e a resposta limpa o cookie de sessão | Must | Depois de trocar a senha, a próxima requisição com o mesmo cookie recebe `401` e o frontend leva à tela de login | 🟢 |
| RF-10 | Criação (`create-user` e `POST /users`) e redefinição (CLI e API) aplicam a mesma política mínima de senha: 8 caracteres ou mais, contando caracteres (não bytes), sem exigir classes de caractere (RN-05) | Must | Senha de 7 caracteres é recusada nos quatro caminhos com a mesma mensagem, sem gravar nada. Senha de 8 é aceita | 🟢 |
| RF-11 | Tela "Alterar senha" no frontend, com link no menu: campos senha atual, senha nova e confirmação. Chama a rota de RF-07 e, com sucesso, leva ao login | Must | Confirmação diferente da nova é barrada na própria tela, sem chamar a API. Senha atual errada exibe mensagem na tela e mantém o usuário logado. Sucesso leva à tela de login | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Segurança | A senha nunca aparece em `argv`, portanto nunca aparece no histórico do shell nem em `ps`/`/proc/<pid>/cmdline` enquanto o script roda | Causa raiz do incidente de 2026-09-23. Senha em `argv` fica visível a outros usuários da VM durante a execução | 🟢 |
| Segurança | Nenhuma resposta HTTP e nenhuma linha de log da redefinição contém a senha nem o hash. O log registra quem redefiniu, de quem e por qual canal (CLI ou API) | W004 da `005` (senha nunca em claro) e padrão de log de `authRoutes.ts` | 🟢 |
| Segurança | A redefinição reutiliza o mesmo algoritmo e os mesmos parâmetros de hash da criação (scrypt, `passwordHash.ts`), sem caminho paralelo de gravação | Evita divergência de formato entre usuário criado e usuário redefinido (mesmo raciocínio de `appUsers.ts` na `005`) | 🟢 |
| Segurança | Troca de hash e encerramento das sessões acontecem juntos: se um falhar, nenhum dos dois fica aplicado pela metade | Uma senha trocada com sessões antigas vivas anularia RN-03 | 🟡 |
| Compatibilidade | O novo uso do script documenta a quebra do formato antigo (`create-user -- <usuario> <senha>`) em `onboarding.md` e na mensagem de erro de RF-04 | O formato antigo está em `docs/deploy-hermes.md` e no `onboarding.md` da `005` | 🟢 |
| Operação | O script funciona dentro de `npm run` (onde stdin do npm é repassado ao processo) e com `tsx` direto | O uso previsto é `npm run create-user`, igual à `005` | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Criar usuário digitando a senha no terminal
  Dado um terminal interativo na VM
  Quando o operador roda "npm run create-user -- ana"
  E digita a mesma senha, com caracteres especiais, na senha e na confirmação
  Então nada do que foi digitado aparece na tela
  E o usuário "ana" consegue entrar na aplicação com essa senha exata

Cenário: Confirmação diferente
  Dado um terminal interativo
  Quando o operador digita senhas diferentes na senha e na confirmação
  Então o script termina com erro
  E nenhum usuário é criado

Cenário: Criar usuário por stdin em script de deploy
  Dado um ambiente sem terminal interativo
  Quando o deploy executa "printf '%s\n' 'p@ss w$rd!#&' | npm run create-user -- ana"
  Então o usuário "ana" é criado
  E consegue entrar com a senha "p@ss w$rd!#&"

Cenário: Senha passada como argumento é recusada
  Quando alguém executa "npm run create-user -- ana minhasenha"
  Então o script termina com erro explicando que a senha não é mais aceita como argumento
  E nenhum usuário é criado

Cenário: Redefinir senha pela linha de comando
  Dado o usuário "ana" com dois perfis de conexão e uma sessão ativa
  Quando o operador redefine a senha de "ana" pelo script
  Então "ana" entra com a senha nova e não entra com a antiga
  E os dois perfis de conexão continuam existindo
  E a sessão que existia antes passa a receber 401

Cenário: Redefinir senha de usuário inexistente pela linha de comando
  Quando o operador tenta redefinir a senha de "fantasma"
  Então o script termina com erro
  E nenhum usuário é criado

Cenário: Trocar a própria senha pela tela "Alterar senha"
  Dado a usuária "ana" autenticada em dois navegadores
  Quando ela informa a senha atual correta e uma senha nova válida, confirmada
  Então a senha de "ana" é trocada
  E a resposta limpa o cookie de sessão e ela é levada ao login
  E a sessão do outro navegador também passa a receber 401

Cenário: Senha atual incorreta
  Dado a usuária "ana" autenticada
  Quando ela tenta trocar a senha informando uma senha atual errada
  Então a resposta é 403 e a senha não muda
  E ela continua logada, vendo uma mensagem de senha atual incorreta

Cenário: Senha abaixo do mínimo
  Quando alguém cria ou redefine uma senha de 7 caracteres, por CLI ou API
  Então a operação é recusada com a mesma mensagem nos dois canais
  E nada é gravado

Cenário: Redefinir senha pela API sem sessão
  Dado nenhuma sessão autenticada
  Quando alguém chama a rota de redefinição
  Então a resposta é 401 e nenhuma senha é alterada
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01 a RF-04 | Must | Corrigem o defeito já observado (senha truncada) e tiram a senha de `argv` |
| RF-05, RF-06, RF-08 | Must | Redefinição sem perder usuário e perfis, que é o pedido central. Sessões encerradas são decisão explícita do operador |
| RF-07, RF-11 | Must | Pedido explícito do operador: rota na API e tela "Alterar senha" (esclarecimento de 2026-09-23) |
| RF-09 | Must | Pela API a troca é sempre da própria senha (RN-04), então encerrar a sessão atual é parte direta de RF-08 |
| RF-10 | Must | Política mínima de 8 caracteres decidida em `/reversa-clarify` |
| Redefinir senha de outro usuário pela API ou pela tela | Won't | Fica só no script da VM (RN-04) |

## 9. Esclarecimentos

### Sessão 2026-09-23 (respostas dadas junto do pedido)

- **Q:** A redefinição fica só na linha de comando, rodada na VM, ou também ganha uma rota na API?
  **R:** Nas duas: linha de comando na VM e rota na API.
- **Q:** Redefinir a senha deve encerrar as sessões ativas daquele usuário?
  **R:** Sim.
- **Q:** Sem terminal interativo, a senha pode vir por stdin, para uso em scripts de deploy?
  **R:** Sim.

### Sessão 2026-09-23 (`/reversa-clarify`)

- **Q:** Autorização da rota da API: quem pode redefinir a senha de quem?
  **R:** Só a própria senha. Cada usuário troca a sua informando a senha atual. Redefinir a de outra pessoa fica só no script da VM (opção a).
- **Q:** Política mínima de senha, valendo para criar e para redefinir, na CLI e na API?
  **R:** Mínimo de 8 caracteres.
- **Q:** A rota vem acompanhada de tela no frontend?
  **R:** Sim, tela "Alterar senha" com link no menu.

## 10. Lacunas

Nenhuma lacuna pendente. As três dúvidas do documento inicial foram resolvidas em `/reversa-clarify` (sessão de 2026-09-23, ver Esclarecimentos acima).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-requirements`, já incorporando as três respostas dadas junto do pedido | reversa |
| 2026-09-23 | `/reversa-clarify`: resolvidas DÚVIDA-1 (só a própria senha pela API, com senha atual), DÚVIDA-2 (mínimo 8 caracteres) e DÚVIDA-3 (tela "Alterar senha"). Nenhum marcador de dúvida pendente | reversa |
