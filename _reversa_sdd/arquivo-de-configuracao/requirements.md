# arquivo-de-configuracao

> Fonte: `code-analysis.md` (Feature: arquivo-de-configuracao), `data-dictionary.md` (schema `CONFIG`), `flowcharts/arquivo-de-configuracao.md`, ADR-0003, ADR-0007.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão Geral

Camada de indireção sobre os prompts interativos (`ask`/`confirm`) que permite pré-responder qualquer pergunta do fluxo via um JSON parcial passado em `--config`: cada chave resolvida por caminho com pontos (dotted-path) usa o valor do arquivo quando presente e cai de volta para o prompt interativo original quando ausente — sem exigir preencher tudo, sem validação formal de schema. 🟢

## Responsabilidades

- Carregar e fazer parse do JSON de `--config`, falhando rápido (`sys.exit(1)`) em arquivo ausente ou JSON inválido. 🟢
- Resolver qualquer chave por caminho com pontos (`cfg`), com fallback a `default` quando o caminho não existe. 🟢
- Envolver `ask`/`confirm` (`cfg_ask`/`cfg_confirm`) para que qualquer ponto de decisão do fluxo principal use o config quando disponível, mascarando senha no console (`••••••`). 🟢
- Substituir o padrão "migrar tudo?/números separados por vírgula" para seleção de rotinas/tabelas por nomes exatos configuráveis, ou `"all"` (`select_items`). 🟢
- Gerar um template JSON completo, comentado (`_comment_*`), cobrindo toda chave configurável do fluxo (`write_config_template`, `--init-config`). 🟢

## Regras de Negócio

- Chave ausente do JSON sempre volta a ser perguntada interativamente — nunca é tratada como erro, mesmo que o operador tenha digitado o nome errado (ex: `tables.forceinnodb` em vez de `tables.force_innodb`); não há validação de schema. 🟡 (ver `domain.md`/`code-analysis.md`, lacuna documentada)
- Seleção de rotinas/tabelas via config usa **nomes exatos**, nunca índices — decisão deliberada porque índices mudam entre execuções conforme o schema de origem evolui; nomes não encontrados no schema atual geram `warn`, mas não abortam a execução. 🟡 Ver ADR-0003.
- `destination.create_database_if_missing` (novo em `971bdf5`) é resolvido via `cfg_confirm` apenas quando `connect()` recebe erro MySQL 1049 na conexão de destino — não é perguntado antecipadamente, só reage ao erro real. 🟢
- Porta padrão sugerida para o destino é `3306` (não mais `3307`), e o `database` de destino sugere o mesmo nome do banco de origem como default — mudanças de *default de prompt* apenas, não afetam quem já usa `--config` com esses campos preenchidos. 🟢 Ver ADR-0007.
- Senha nunca é impressa em texto claro no console, mesmo quando resolvida via config (mascarada como `••••••`). 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Carregar JSON de `--config` e popular `CONFIG` global antes de `main()` rodar | Must | Arquivo válido é carregado sem erro; arquivo ausente/JSON inválido aborta com `sys.exit(1)` e mensagem clara |
| RF-02 | Resolver qualquer chave por caminho com pontos, com fallback a `default` | Must | `cfg("tables.force_innodb", False)` retorna o valor do config se presente, senão `False` |
| RF-03 | `cfg_ask`/`cfg_confirm` só perguntam interativamente quando a chave está ausente do config | Must | Toda pergunta do fluxo interativo tem uma chave `--config` equivalente documentada no template |
| RF-04 | `select_items` aceita `"all"` ou lista de nomes exatos, com aviso (não erro) para nomes não encontrados | Must | Lista com um nome inexistente gera `warn` e segue com os nomes válidos |
| RF-05 | `--init-config` gera um template JSON com todas as chaves e comentários explicativos, sem executar a migração — **incluindo aviso explícito de que chaves desconhecidas/grafadas errado são ignoradas silenciosamente (sem validação de schema), decisão confirmada em revisão de 2026-09-15 (`../questions.md#pergunta-6`)** | Should | Template gerado cobre 100% das chaves usadas por `cfg`/`cfg_ask`/`cfg_confirm` em `main()`; processo termina sem tentar conectar a nenhum banco; contém o aviso sobre chaves desconhecidas |
| RF-06 | `destination.create_database_if_missing` habilita criação automática do banco de destino em erro 1049 | Should | Com a chave em `true` (ou ausente, default `true`) e banco inexistente, `CREATE DATABASE` roda automaticamente e a conexão é refeita |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Configurabilidade | Todo ponto de decisão interativo do script tem uma chave `--config` dotted-path equivalente | `migrate_routines.py:118-247` | 🟢 |
| Segurança | Senha resolvida via config nunca é impressa em texto claro no console | `migrate_routines.py:143` (`cfg_ask`) | 🟢 |
| Robustez | Falha de parse do JSON de config é fatal e imediata (`sys.exit(1)`), não silenciosa | `migrate_routines.py:118` (`load_config`) | 🟢 |

> Inferido a partir do código. Não há validação de schema (JSON Schema/Pydantic) — ausência documentada como lacuna, não como requisito não atendido intencionalmente.

## Critérios de Aceitação

```gherkin
Dado um arquivo de config JSON com apenas "tables.force_innodb": true preenchido
Quando o script roda com --config apontando para esse arquivo
Então a pergunta sobre force_innodb não é feita interativamente, usa true
  E todas as demais perguntas do fluxo continuam interativas normalmente

Dado um arquivo de config inexistente passado em --config
Quando o script é iniciado
Então o processo termina imediatamente com sys.exit(1) e mensagem de erro clara
  E nenhuma conexão de banco é tentada
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|----------------|
| Carregamento + resolução dotted-path (RF-01, RF-02) | Must | Sem isso, `--config` não funciona de forma alguma |
| `cfg_ask`/`cfg_confirm` cobrindo todo ponto de decisão (RF-03) | Must | É o contrato central que faz a semi-automação funcionar |
| `select_items` por nome exato (RF-04) | Must | Índices instáveis entre execuções tornariam o config inutilizável para seleção de itens |
| `--init-config` (RF-05) | Should | Facilita adoção, mas o operador pode escrever o JSON manualmente sem ele |
| `create_database_if_missing` (RF-06) | Could | Tem alternativa (criar o banco manualmente antes de rodar) |

> Prioridade inferida por centralidade no propósito de permitir execução não interativa (ver CLAUDE.md, "Config file").

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `migrate_routines.py:118` | `load_config` | 🟢 |
| `migrate_routines.py:132` | `cfg` | 🟢 |
| `migrate_routines.py:143` | `cfg_ask` | 🟢 |
| `migrate_routines.py:151` | `cfg_confirm` | 🟢 |
| `migrate_routines.py:159` | `select_items` | 🟢 |
| `migrate_routines.py:189` | `write_config_template` | 🟢 |
| `migrate_routines.py:248` | `connect` (consumidor de `destination.create_database_if_missing`) | 🟢 |
