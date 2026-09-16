---
schemaVersion: 1
generatedAt: 2026-09-15T19:00:00Z
reversa:
  version: "1.3.3"
kind: migration_brief
producedBy: orchestrator
hash: "sha256:2375e4e0401db8642e315f7414065a6a611f58c8abc00ce54b5c2e1ff2f262e6"
---

# Migration Brief

> Documento de critério de migração coletado em entrevista no início do `/reversa-migrate`.
> Consumido pelos seis agentes do Time de Migração. Não pergunta paradigma (responsabilidade do Paradigm Advisor) nem apetite (derivado em `paradigm_decision.md`).

## Objetivo da migração
Sair de uma ferramenta CLI interativa (`migrate_routines.py`/`fix_collation_stamp.py`) para uma stack moderna acessível via web — permitindo que a migração de bancos MySQL 5.x → 8.x deixe de depender de execução manual em terminal e passe a ser operável por uma interface web.

## Métricas de sucesso
- Após a execução de uma migração via web, o banco de destino é acessível e contém os objetos (tabelas + procedures/functions) copiados corretamente do banco de origem.
- Nenhuma tabela ou procedure/function é perdida ou chega incompleta/corrompida no destino (ver Fatores de risco).
- A interface web reproduz o mesmo controle de decisão que o CLI oferece hoje (seleção de itens, preview de compatibilidade, confirmação antes de aplicar).

## Restrições
- **Prazo**: não informado.
- **Orçamento**: não informado.
- **Técnicas**: uso interno apenas — sem exposição à internet pública. Acesso via VM interna + VPN.
- **Operacionais**: não informado.

## Fatores de risco conhecidos
- Alguma tabela ou procedure/function não chegar íntegra ao destino (ex: falha silenciosa de FK, transformação de DDL incompleta, dados truncados na cópia).

## Stakeholders
| Nome / papel | Responsabilidade na migração |
|---|---|
| Área de Infraestrutura | Gerência direta da iniciativa |

## Stack alvo
- **Linguagem**: Node.js / TypeScript.
- **Framework**: Fastify ou NestJS (a decidir pelo Strategist/Designer).
- **Banco**: MySQL 8.x (mantido — é o próprio destino da ferramenta original; não confundir com um banco de aplicação novo).
- **Mensageria**: em aberto — provável necessidade de fila/job runner dado o paradigma event-driven natural de Node.js (ver `paradigm_decision.md`).
- **Infra**: VM interna, acessível via VPN, sem exposição à internet.
- **Outros componentes relevantes**: em aberto.

## Escopo declarado
- **Incluído**: as 5 features documentadas em `_reversa_sdd/` — `migracao-de-rotinas`, `migracao-de-tabelas`, `arquivo-de-configuracao`, `relatorios-de-migracao`, `correcao-de-collation`.
- **Excluído**: nenhum módulo excluído — escopo completo do legado.

## Notas livres
Por pedido do operador, o trabalho desta migração (specs + futura implementação) ocorre na branch `migracao-web-stack`, isolada de `main`, para não comprometer a interface/versão CLI atual em produção enquanto a nova stack web é desenvolvida.
