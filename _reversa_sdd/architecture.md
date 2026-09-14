# Arquitetura — migra_db_mysql

> Gerado pelo Architect em 2026-09-02 · Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão geral

`migra_db_mysql` é um par de **scripts Python CLI standalone**, sem framework de aplicação, servidor, API ou frontend — a "arquitetura" é a de uma ferramenta de linha de comando operada interativamente por um DBA, que lê e escreve diretamente em servidores MySQL via `mysql-connector-python`. Não há camada de persistência própria, autenticação, nem múltiplos usuários concorrentes — cada execução é síncrona, de ponta a ponta, num único processo. 🟢

```
┌─────────────┐     lê/escreve      ┌──────────────────┐
│  Operador   │ ──── prompts ────▶  │ migrate_routines.py│
│  (DBA)      │ ◀─── relatório ──── │  (CLI principal)   │
└─────────────┘                     └──────────┬─────────┘
                                                │ mysql-connector-python
                                    ┌───────────┴────────────┐
                                    ▼                        ▼
                          ┌──────────────────┐    ┌──────────────────┐
                          │  MySQL 5.x        │    │  MySQL 8.x        │
                          │  (Origem)          │    │  (Destino)        │
                          └──────────────────┘    └──────────────────┘

┌─────────────┐                     ┌───────────────────────┐
│  Operador   │ ── .env/prompts ──▶ │ fix_collation_stamp.py │
└─────────────┘                     └───────────┬───────────┘
                                                 │ (mesmo banco, papel duplo)
                                                 ▼
                                       ┌──────────────────┐
                                       │  MySQL 8.x         │
                                       │  (já convertido)   │
                                       └──────────────────┘
```

## Diagramas C4

- [`c4-context.md`](c4-context.md) — Nível 1: o sistema, o operador e os dois bancos MySQL
- [`c4-containers.md`](c4-containers.md) — Nível 2: os dois scripts + arquivos locais como containers independentes
- [`c4-components.md`](c4-components.md) — Nível 3: componentes internos de cada script (extração/transformação/aplicação/relatório)

## ERD

- [`erd-complete.md`](erd-complete.md) — não há schema de banco aplicacional (o schema migrado é descoberto em runtime, não modelado no código); o ERD documenta as estruturas de dados transientes do próprio script (rotina extraída, resultado, Issue, fk_spec, config, relatório)

## Integrações externas

| Integração | Tipo | Protocolo/Formato | Direção |
|---|---|---|---|
| MySQL 5.x (Origem) | Banco de dados | Protocolo MySQL / TCP | Leitura (metadados via `information_schema`, DDL via `SHOW CREATE`, dados via `SELECT`) |
| MySQL 8.x (Destino) | Banco de dados | Protocolo MySQL / TCP | Escrita (DDL, `INSERT`, `ALTER`) + leitura auxiliar (`information_schema` para detectar FKs órfãs) |
| Sistema de arquivos local | I/O local | JSON, `.env`, HTML, SQL | Leitura de config/credenciais; escrita de relatórios e logs |

Não há API REST/GraphQL, webhook, fila de mensagens ou serviço de terceiros. 🟢

## Dívidas técnicas identificadas

| Dívida | Severidade (inferida) | Onde |
|---|---|---|
| Duplicação de código entre os dois scripts (helpers de output, conexão, remoção de DEFINER) | média | `fix_collation_stamp.py` inteiro vs. `migrate_routines.py:62-292` |
| Sem gerenciador de dependências (`requirements.txt`/`pyproject.toml`) | média | Nível de projeto |
| Sem testes automatizados (0% de cobertura) | alta — para uma ferramenta que faz `DROP`/`ALTER` em produção | Nível de projeto |
| Sem validação de schema no `--config` JSON — chave grafada errado falha silenciosamente | baixa/média | `migrate_routines.py:131` (`cfg()`) |
| Heurística de `fix_only_full_group_by` pode gerar falso positivo (`re.DOTALL` casa através de statements não relacionados) | baixa | `migrate_routines.py:472` |
| `.env.example` aparenta conter credenciais reais de rede interna, não placeholders | 🔴 requer confirmação humana — potencial exposição de credencial | raiz do projeto |
| Diretórios de relatório/log acumulam no disco sem limpeza automática | baixa | `save_report`, `save_log` |
| `OLD_COLLATION` fixo no código-fonte de `fix_collation_stamp.py` (não configurável) — exige editar código para outro cenário de collation | baixa | `fix_collation_stamp.py:57` |

## Spec Impact Matrix

Ver [`traceability/spec-impact-matrix.md`](traceability/spec-impact-matrix.md).
