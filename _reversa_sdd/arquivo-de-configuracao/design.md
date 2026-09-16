# arquivo-de-configuracao — Design Técnico

> Fonte: `code-analysis.md` (Feature: arquivo-de-configuracao), `flowcharts/arquivo-de-configuracao.md`, `data-dictionary.md` (schema `CONFIG`).
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Interface

Não há endpoints HTTP — interface é o próprio flag `--config <path>` / `--init-config <path>` da CLI. Símbolos principais:

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `load_config` | `(path: str)` | `dict` | `sys.exit(1)` em arquivo ausente ou JSON inválido |
| `cfg` | `(key: str, default=None)` | `Any` | Navega `CONFIG` por caminho com pontos; retorna `default` se qualquer segmento não existir ou não for dict |
| `cfg_ask` | `(key: str, prompt: str, default=None, password=False)` | `str` | Se `cfg(key)` não for `None`, informa o valor (mascarando senha) e retorna sem perguntar; senão delega a `ask` |
| `cfg_confirm` | `(key: str, prompt: str, default: bool = True)` | `bool` | Mesmo contrato de `cfg_ask`, para confirmações booleanas |
| `select_items` | `(items: list[dict], cfg_key: str, label: str)` | `list[int]` | Via config aceita `"all"` ou lista de nomes exatos; sem config, cai no fluxo interativo (índices 1-based) |
| `write_config_template` | `(path: str)` | `None` | Serializa o template fixo com `_comment_*` embutidos; usado por `--init-config` |

## Fluxo Principal

1. Se `--config <path>` foi passado, `load_config(path)` lê e faz parse do JSON antes de `main()` rodar; popula `CONFIG` global (`if __name__ == "__main__"`, `:2062`). 🟢
2. Cada ponto de decisão do fluxo principal (conexão, seleção de rotinas/tabelas, modo de migração, filtros, `column_defaults`, confirmações de aplicação) chama `cfg_ask`/`cfg_confirm`/`select_items` em vez de `ask`/`confirm` diretamente. 🟢
3. `cfg`/`cfg_ask`/`cfg_confirm` navegam `CONFIG` pelo caminho dotted (ex: `"tables.force_innodb"`) — se todo o caminho existir, usa o valor encontrado e informa no console; se qualquer segmento faltar, cai para o prompt interativo original. 🟢
4. `select_items` é o único ponto com lógica de resolução não trivial: com config, resolve nomes → índices via diferença de conjuntos (nomes não encontrados geram `warn`, mas não abortam); sem config, pede números separados por vírgula e filtra apenas dígitos válidos dentro do range. 🟢
5. Se `--init-config <path>` foi passado em vez de `--config`, `write_config_template(path)` roda isoladamente e o processo termina (`sys.exit(0)`) sem executar `main()`. 🟢

Ver diagrama completo em `../flowcharts/arquivo-de-configuracao.md`.

## Fluxos Alternativos

- **Chave presente mas com tipo errado** (ex: string onde se espera bool): não há coerção nem validação — o valor é devolvido como está, e o comportamento downstream depende de como o chamador usa esse valor. 🟡 Não confirmado contra um caso real de tipo incompatível.
- **Chave grafada errada** (ex: `tables.forceinnodb`): tratada exatamente como chave ausente — pergunta volta a ser interativa, sem aviso de "chave desconhecida". 🟡 Ver Riscos e Lacunas.
- **`select_items` com nome não encontrado no schema atual:** gera `warn`, mas os demais nomes válidos da lista são usados normalmente — não aborta a seleção inteira. 🟢
- **`destination.create_database_if_missing`:** só é resolvido/perguntado quando `connect()` já recebeu erro 1049 — não é uma pergunta antecipada no início do fluxo. 🟢

## Dependências

- **Output Helpers** (`info/ok/warn/error/ask/confirm`) — `cfg_ask`/`cfg_confirm` são wrappers drop-in sobre `ask`/`confirm`, mesma assinatura mais o parâmetro `key` na frente. 🟢
- **Connection Manager** (`connect`/`ask_connection`) — consome `cfg_ask`/`cfg_confirm` com `cfg_prefix="source"`/`"destination"` para resolver host/port/user/password/database, e `cfg_confirm("destination.create_database_if_missing", ...)` especificamente no fluxo de auto-criação de banco (ver ADR-0007). 🟢
- **Toda a orquestração em `main()`** — praticamente todo ponto de decisão interativo do script (rotinas, tabelas, relatório) passa por `cfg_ask`/`cfg_confirm`/`select_items`. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Config parcial com fallback por chave, não tudo-ou-nada (ver `decisions.md`, ADR-0003) | `migrate_routines.py:132-159` | 🟡 |
| Sem validação de schema formal (JSON Schema/Pydantic) — falha de chave errada é silenciosa | `migrate_routines.py:118-159` | 🟡 |
| Seleção por nomes exatos, não índices, especificamente para sobreviver a mudanças de schema entre execuções | `migrate_routines.py:159` (`select_items`) | 🟢 |
| Template gerado (`--init-config`) usa `_comment_*` como chaves JSON reais, não JSON5/JSONC — mantém o arquivo válido em qualquer parser JSON padrão, ao custo de poluir a estrutura com chaves não funcionais | `migrate_routines.py:189` | 🟢 |

## Estado Interno

`CONFIG: dict` é module-level, populado uma única vez antes de `main()` rodar e nunca modificado depois — é efetivamente imutável durante toda a execução. 🟢

## Observabilidade

- Toda resolução via config é anunciada no console (`info`/similar) antes de prosseguir, para o operador saber que aquela pergunta foi pulada e com qual valor. 🟢
- Não há log de quais chaves do config **não** foram reconhecidas/usadas — o operador não tem como saber, sem ler o código, se uma chave do seu JSON foi ignorada por erro de digitação. 🟡

## Riscos e Lacunas

- 🟡 Sem validação de schema: uma chave grafada errada (`tables.forceinnodb` em vez de `tables.force_innodb`) simplesmente não é encontrada por `cfg()` e a pergunta correspondente volta a ser interativa, sem qualquer aviso de "chave desconhecida". **Decidido em revisão (2026-09-15, `../questions.md#pergunta-6`): comportamento intencional a preservar na reimplementação (sem validação de schema) — mas o template gerado por `--init-config`/`write_config_template` deve documentar esse comportamento explicitamente (comentário `_comment_*` avisando que chaves desconhecidas são silenciosamente ignoradas), para que o operador saiba do risco sem precisar ler o código-fonte.**
- 🔴 Não há forma de confirmar, sem um caso real reportado, se algum tipo de dado incompatível numa chave (ex: string onde se espera lista) causa uma exceção não tratada em algum ponto downstream específico, ou se todos os usos são suficientemente defensivos.
- 🟡 `select_items` via config: a lista de nomes precisa ser mantida sincronizada manualmente pelo operador com o schema de origem real — não há um modo de "validar config contra schema atual" antes de rodar a migração de fato.
