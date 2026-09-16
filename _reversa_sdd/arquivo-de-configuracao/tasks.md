# arquivo-de-configuracao — Tarefas de Implementação

> Sequência executável para reimplementar esta unit a partir do legado (`migrate_routines.py`), com rastreabilidade.

## Pré-requisitos

- [ ] Output Helpers (`info/ok/warn/error/ask/confirm`) disponíveis
- [ ] Estrutura de flags de CLI (`--config`, `--init-config`) já parseada antes de `main()` rodar

## Tarefas

- [ ] T-01, Implementar `load_config(path)` — lê e faz parse do JSON; `sys.exit(1)` com mensagem clara em arquivo ausente ou JSON inválido
  - Origem no legado: `migrate_routines.py:118`
  - Critério de pronto: arquivo válido popula `CONFIG`; arquivo ausente ou JSON malformado aborta o processo antes de qualquer conexão de banco
  - Confiança: 🟢

- [ ] T-02, Implementar `cfg(key, default=None)` — navega `CONFIG` por caminho com pontos, retornando `default` se qualquer segmento não existir ou não for dict
  - Origem no legado: `migrate_routines.py:132`
  - Critério de pronto: `cfg("tables.force_innodb")` retorna o valor aninhado correto quando presente; retorna `default` para caminho parcial ou totalmente ausente
  - Confiança: 🟢

- [ ] T-03, Implementar `cfg_ask(key, prompt, default=None, password=False)` e `cfg_confirm(key, prompt, default=True)` — wrappers drop-in de `ask`/`confirm` que usam `cfg(key)` quando presente (mascarando senha), senão delegam ao prompt interativo
  - Origem no legado: `migrate_routines.py:143`, `:151`
  - Critério de pronto: com a chave presente no config, nenhum prompt interativo aparece e o valor do config é usado; sem a chave, comportamento idêntico a `ask`/`confirm` puro
  - Confiança: 🟢

- [ ] T-04, Implementar `select_items(items, cfg_key, label)` — via config aceita `"all"` ou lista de nomes exatos (com `warn` para nomes não encontrados, sem abortar); sem config, cai no fluxo interativo por índices 1-based
  - Origem no legado: `migrate_routines.py:159`
  - Critério de pronto: lista de nomes com um item inexistente no schema atual gera `warn` e segue com os válidos; `"all"` seleciona todos os itens; fluxo interativo aceita apenas dígitos válidos dentro do range
  - Confiança: 🟢

- [ ] T-05, Implementar `write_config_template(path)` — serializa o template fixo com todas as chaves documentadas e comentários `_comment_*`, usado por `--init-config`
  - Origem no legado: `migrate_routines.py:189`
  - Critério de pronto: template gerado contém 100% das chaves listadas em `data-dictionary.md` (schema `CONFIG`); processo termina sem tentar conectar a nenhum banco; **inclui um `_comment_*` avisando que chaves desconhecidas/grafadas errado são ignoradas silenciosamente, sem validação de schema (decisão de revisão, `../questions.md#pergunta-6`)**
  - Confiança: 🟢

- [ ] T-06, Cablear `cfg_ask`/`cfg_confirm`/`select_items` em todo ponto de decisão de `main()` (conexão origem/destino, seleção de rotinas/tabelas, modo de migração, filtros, `column_defaults`, confirmações de aplicação, salvar relatório)
  - Origem no legado: `migrate_routines.py:1499-1995` (chamadas espalhadas em `main()`)
  - Critério de pronto: rodar com um config totalmente preenchido não gera nenhum prompt interativo; rodar sem `--config` reproduz o comportamento 100% interativo original
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01, Teste do happy path: config parcial preenche algumas chaves, restante permanece interativo (ver `requirements.md`, Critérios de Aceitação)
- [ ] TT-02, Teste do caso de erro: `--config` com arquivo inexistente ou JSON inválido aborta com `sys.exit(1)` antes de qualquer conexão
- [ ] TT-03, Teste de `select_items` com nome inexistente na lista — segue com os válidos, `warn` emitido
- [ ] TT-04, Teste de `--init-config` — template gerado é JSON válido, contém todas as chaves esperadas, processo não executa migração
- [ ] TT-05, Teste de mascaramento de senha no console quando resolvida via config

## Tarefas de Migração de Dados

N/A — esta unit não migra dados, apenas resolve configuração.

## Ordem Sugerida

1. T-01 e T-02 são a base (carregamento + navegação) e devem vir primeiro.
2. T-03 depende de T-02 (usa `cfg` internamente).
3. T-04 e T-05 são independentes entre si e de T-03 — podem ser feitas em paralelo.
4. T-06 depende de T-01 a T-05 todos prontos — é o passo de integração que conecta esta unit ao restante do fluxo (`migracao-de-rotinas`, `migracao-de-tabelas`, `relatorios-de-migracao`).

## Decisões de Revisão (2026-09-15)

- **Validação de schema:** decidido manter o fallback silencioso atual (sem Pydantic/JSON Schema) — não é uma tarefa da reimplementação (`../questions.md#pergunta-6`). Em vez disso, adicionar a T-05 (`write_config_template`) a exigência de documentar essa limitação no próprio template gerado (comentário `_comment_*` explícito sobre chaves desconhecidas serem ignoradas silenciosamente).

## Lacunas Pendentes (🔴)

- Comportamento exato com tipo de dado incompatível numa chave (ex: string onde se espera lista) não está confirmado contra um caso real — validar com testes dedicados antes de considerar a reimplementação equivalente ao original.
