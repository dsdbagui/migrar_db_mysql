# Interface: Linha de comando `create-user` (alterada)

> Identificador: `006-redefinicao-de-senha`
> Tipo: CLI (`package.json` → `tsx --env-file=.env src/core/db/createUser.ts`)

## Uso

```text
npm run create-user -- <username>              # cria usuário
npm run create-user -- --reset <username>      # redefine a senha de um usuário existente
```

A senha **nunca** é argumento (RN-01).

## Entrada da senha

| Situação | Comportamento |
|----------|---------------|
| stdin é terminal (`isTTY`) | Pergunta `Senha: ` e depois `Confirme a senha: `, sem eco. Enter conclui, Backspace apaga, Ctrl+C aborta (código 130, nada gravado). As duas precisam ser iguais |
| stdin não é terminal | Lê stdin até o fim e usa a **primeira linha**, sem o `\n`/`\r\n` final. Sem confirmação. Ex.: `printf '%s\n' "$SENHA" \| npm run create-user -- ana` |

Em ambos os casos a senha é usada exatamente como lida: sem trim, sem interpretação de `$`, `#`, `!`, `&`, espaços etc. (RF-03), e passa pela política de 8 caracteres (RF-10).

## Códigos de saída

| Código | Quando |
|--------|--------|
| `0` | usuário criado ou senha redefinida |
| `1` | falha de execução: username já existe (criação), username inexistente (`--reset`), confirmação diferente, senha fora da política, stdin vazio, erro de banco |
| `2` | erro de uso: senha passada como argumento, argumentos a mais, flag desconhecida, username ausente. A mensagem mostra o uso correto, inclusive a forma com stdin |
| `130` | interrompido com Ctrl+C durante a digitação |

## Efeitos do `--reset`

Troca o hash e apaga **todas** as sessões do usuário na mesma transação (RF-08). Preserva o `id` e os `connection_profiles` do usuário (RF-05). Imprime quantas sessões foram encerradas.

## Quebra de compatibilidade

`npm run create-user -- <username> <senha>` (formato da `005`) passa a terminar com código `2` e a mensagem de uso, sem gravar nada.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-23 | Versão inicial gerada por `/reversa-plan` | reversa |
