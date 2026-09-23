# Investigation: Entrada segura de senha no create-user e redefinição de senha

> Identificador: `006-redefinicao-de-senha`
> Data: `2026-09-23`

## 1. O defeito que originou a feature

Em 2026-09-23, logo após a entrega da `005`, o operador criou o usuário `usu_gui` com `npm run create-user -- usu_gui <senha>` e percebeu que a senha foi gravada truncada. Há duas causas combinadas:

1. **O shell interpreta a senha antes do Node recebê-la.** Sem aspas, `$x` vira variável (vazia), `#` depois de espaço inicia comentário, `!` dispara expansão de histórico, `&`/`;`/`|` encerram o comando e espaço separa argumentos.
2. **O script descarta argumentos excedentes em silêncio:** `const [username, password] = process.argv.slice(2)` em `src/core/db/createUser.ts`. Uma senha partida por espaço é gravada só até o primeiro espaço, sem erro.

Aspas simples contornam o problema, mas dependem de o operador lembrar, e a senha continua visível em `~/.bash_history` e em `ps`/`/proc/<pid>/cmdline` durante a execução. A correção estrutural é tirar a senha de `argv`.

Não havia como recuperar o acesso sem apagar o usuário, o que levaria junto seus `connection_profiles` (`ON DELETE CASCADE`, `005_connection_profiles_owner.sql`). O contorno usado foi um `UPDATE` direto do hash por um comando `tsx -e` pontual, com a senha lida por `read -s`.

## 2. Alternativas para ler senha no terminal (Node, sem dependência)

| Alternativa | Avaliação |
|-------------|-----------|
| `process.stdin.setRawMode(true)` + leitura caractere a caractere | **Escolhida (D-01).** API pública e estável. Controle total de eco, Backspace e Ctrl+C. Cerca de 40 linhas |
| `readline.createInterface` + sobrescrever `rl._writeToOutput` | Receita comum na web, mas `_writeToOutput` é interna (prefixo `_`), sem garantia entre versões do Node |
| Pacotes `read`, `prompts`, `inquirer` | Funcionam, mas trazem dependência nova para um caso de ~40 linhas, contra a stack mínima (`docs/seguranca-e-stack.md`) |
| `stty -echo` via `child_process` | Depende de binário externo e só funciona em Unix |

Pontos de atenção do modo raw:
- Ctrl+C **não** gera `SIGINT` em modo raw. Chega como o byte `\u0003` e precisa ser tratado à mão (abortar com código 130).
- Colar texto chega como um bloco de vários caracteres num único evento `data`, então o loop precisa iterar por code point e não assumir um caractere por evento.
- O modo raw precisa ser desligado (`setRawMode(false)`) em todos os caminhos de saída, senão o terminal fica sem eco depois que o script termina.

## 3. Senha por stdin (modo não interativo)

- Detecção por `process.stdin.isTTY`: é `undefined` quando stdin é pipe ou arquivo.
- Ler até `end` e usar só a primeira linha evita que um `\n` final ou uma linha extra acidental virem parte da senha.
- Variável de ambiente foi descartada. O ambiente é herdado por processos filhos e aparece em `/proc/<pid>/environ` para o mesmo usuário, e a senha tende a acabar em arquivos de CI. Stdin é o canal que a própria pergunta do operador indicou.

## 4. Política de senha

A OWASP (Authentication Cheat Sheet) recomenda mínimo de 8 caracteres com MFA e 15 sem MFA, sem regras de composição (maiúscula/símbolo obrigatórios) e com máximo de pelo menos 64. O operador escolheu **8**, abaixo da recomendação sem MFA. Fica registrado aqui como decisão consciente de `/reversa-clarify`, com mitigação parcial pelo scrypt (custo alto por tentativa) e pela exposição só via VPN.

Contagem por code point (`[...s].length`), não por `s.length` (UTF-16) nem por bytes. Assim `"ação1234"` tem 8 caracteres.

## 5. Encerramento de sessões

`app_sessions.user_id` já tem índice (`ix_app_sessions_user`, `004_add_app_auth.sql`), então `DELETE ... WHERE user_id = ?` é barato. Fazer isso na mesma transação da troca de hash garante que não exista um instante com a senha nova e as sessões antigas ainda válidas.

## 6. Referências

- OWASP Authentication Cheat Sheet, seção "Implement Proper Password Strength Controls"
- Node.js docs: `tty.ReadStream#setRawMode`, `process.stdin.isTTY`
- `_reversa_forward/005-perfil-conexao-por-usuario/roadmap.md` (D-03 scrypt, D-09 bootstrap por CLI)
