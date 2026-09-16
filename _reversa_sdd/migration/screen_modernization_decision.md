---
schemaVersion: 1
generatedAt: 2026-09-15T20:55:00Z
reversa:
  version: "1.3.3"
kind: screen_modernization_decision
producedBy: screen_translator
mode: skipped
hash: "sha256:4f523ec07a65aded99b2e5991ad053f9ab8eb1b526f7e81a8701296b05eebecc"
---

# Screen Modernization Decision

> **Estado: skipped.** O legado (`migrate_routines.py`/`fix_collation_stamp.py`) é uma ferramenta CLI batch/interativa por terminal, sem nenhuma tela gráfica (web, desktop, TUI estruturada) — `inventory.md` confirma "Não é uma aplicação web/serviço — não há servidor, rotas, frontend nem ORM". Não há `_reversa_sdd/ui/inventory.md` nem artefatos de UI de nenhum tipo.

## Razão da omissão

Legado é uma ferramenta CLI de prompts `input()`/`print()` sequenciais (com formatação opcional via `rich`), sem telas, componentes visuais ou fluxos de navegação no sentido em que o Screen Translator opera (adaptação origem→alvo de UI). O inventário interno não detectou nenhuma tela: 0 telas encontradas.

## Modos avaliados
N/A — não aplicável, não há UI de origem para avaliar modo de modernização.

## Decisão
N/A — nenhuma decisão de modo necessária.

## Nota para o Designer / Inspector
A interface da versão web nova (wizard multi-step, BR-HUMANA-001 em `target_business_rules.md`) **não é uma tradução de telas do legado** — é uma tela nova, desenhada do zero pelo Designer/agente de codificação, já que não existe UI de origem para adaptar. O Inspector deve pular a paridade visual (não há "antes" visual para comparar) e focar exclusivamente na paridade comportamental/de dados (ver `paradigm_decision.md`, `target_business_rules.md`).
