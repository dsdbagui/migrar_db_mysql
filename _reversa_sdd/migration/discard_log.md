---
schemaVersion: 1
generatedAt: 2026-09-15T19:40:00Z
reversa:
  version: "1.3.3"
kind: discard_log
producedBy: curator
hash: "sha256:5f25f1dc0a0c4eccc5cdad8cd1e7ccede491fc82d9e66342e88316d0db6cfe44"
---

# Discard Log

> Registro completo do que foi descartado da migração e por quê. Cada item tem rastreabilidade para a origem no legado.

## Itens descartados

### BR-DESCARTAR-001
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/design.md` § Fluxo Principal
- **Descrição**: `cfg_ask`/`cfg_confirm` caem para um prompt interativo de terminal (`ask`/`confirm`) sempre que a chave correspondente está ausente do `--config`, no meio da execução de `main()`.
- **Justificativa**: numa aplicação web não existe "terminal esperando input síncrono" no meio de um job — todo parâmetro precisa estar disponível antes do job começar (via payload/formulário) ou ter um default explícito.
- **Vinculado a paradigma**: sim
  - Paradigma legado: procedural síncrono com terminal interativo — cada `ask()`/`confirm()` bloqueia a thread principal esperando `input()`.
  - Como o paradigma alvo absorve o caso: o formulário/wizard web (ver `target_business_rules.md`, BR-HUMANA-001) coleta *todos* os parâmetros antes de iniciar o job; campos não preenchidos usam o default documentado na UI (tooltip/help text), nunca uma pergunta ad-hoc no meio da execução.
- **Reposição no sistema novo**: substituído por validação de formulário + defaults explícitos na UI.
- **Risco de descartar**: baixo — a regra de negócio real ("config parcial com fallback", ADR-0003) sobrevive como BR-MIGRAR-013; só o *mecanismo* de fallback (perguntar interativamente) desaparece.

### BR-DESCARTAR-002
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/decisions.md` (ADR-0007)
- **Descrição**: `destination.create_database_if_missing` só é resolvido/perguntado quando `connect()` já recebeu erro MySQL 1049 (banco de destino inexistente) durante a tentativa de conexão — reação em tempo real, não pergunta antecipada.
- **Justificativa**: um job em background não pode pausar e emitir uma nova pergunta ao usuário no meio da execução de forma equivalente ao `confirm()` de terminal — exigiria um mecanismo de pausa/retomada de job que não existe no legado nem foi pedido no brief.
- **Vinculado a paradigma**: sim
  - Paradigma legado: reação síncrona a erro, com prompt de terminal imediato.
  - Como o paradigma alvo absorve o caso: a opção "criar banco de destino se não existir" vira um checkbox declarado *antes* do job iniciar (parte do mesmo formulário de BR-DESCARTAR-001); se o erro 1049 ocorrer e a opção não tiver sido marcada, o job simplesmente falha com uma mensagem clara, sem tentar "perguntar" no meio do caminho.
- **Reposição no sistema novo**: campo booleano pré-declarado no formulário/payload da API.
- **Risco de descartar**: baixo — o comportamento final (criar banco automaticamente, se autorizado) é preservado; só o timing da decisão muda de "reativo" para "antecipado".

### BR-DESCARTAR-003
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/requirements.md` § RF-05
- **Descrição**: `--init-config` gera um arquivo JSON com todas as chaves possíveis, comentadas via chaves `_comment_*`, para o operador editar manualmente antes de rodar com `--config`.
- **Justificativa**: é um artefato de interação por arquivo texto — próprio de uma ferramenta CLI que não tem UI. Numa aplicação web, a "documentação de campos" acontece na própria interface (tooltips, help text, valores default visíveis), não como um arquivo para o operador editar à parte.
- **Vinculado a paradigma**: sim
  - Paradigma legado: configuração via arquivo texto editado fora da ferramenta.
  - Como o paradigma alvo absorve o caso: cada campo do formulário web carrega sua própria documentação inline (tooltip), eliminando a necessidade de um arquivo de template separado.
- **Reposição no sistema novo**: help text/tooltips no formulário; eventualmente, exportar/importar uma "configuração salva" como conveniência de UX, mas isso é uma feature nova, não uma migração de RF-05.
- **Risco de descartar**: baixo — a necessidade de negócio subjacente ("documentar cada campo configurável para o operador") é atendida por outro meio, mais adequado ao paradigma web.

### BR-DESCARTAR-004
- **Origem**: `_reversa_sdd/correcao-de-collation/decisions.md` (ADR-0005)
- **Descrição**: o legado usa dois mecanismos de credencial diferentes entre as duas ferramentas — `.env` para `fix_collation_stamp.py`, `--config` JSON (ou prompts interativos) para `migrate_routines.py`.
- **Justificativa**: é uma inconsistência técnica do legado (nascida de os dois scripts terem evoluído sem compartilhar infraestrutura — ver ADR-0005), não uma regra de negócio a preservar. A reimplementação unifica as duas ferramentas numa única aplicação web, o que naturalmente elimina a necessidade de dois mecanismos.
- **Vinculado a paradigma**: não — é uma decisão de consistência de produto/arquitetura, independente do paradigma de execução escolhido.
- **Reposição no sistema novo**: um único mecanismo de configuração/credenciais para toda a aplicação (ver BR-HUMANA-002, sobre se isso inclui um cofre de credenciais).
- **Risco de descartar**: baixo — nenhuma regra de negócio é perdida; a duplicação era vista como dívida técnica já no legado (`architecture.md`, tabela de dívidas técnicas).

### BR-DESCARTAR-005
- **Origem**: `_reversa_sdd/relatorios-de-migracao/design.md` § Interface
- **Descrição**: `print_summary_table`/`print_table_summary` renderizam um resumo em tabela de terminal (`rich.Table`, com fallback para texto simples sem `rich`).
- **Justificativa**: renderização de terminal não existe numa aplicação web — o resumo passa a ser uma tela/componente de UI.
- **Vinculado a paradigma**: sim
  - Paradigma legado: saída síncrona para um terminal TTY, com biblioteca de formatação de texto.
  - Como o paradigma alvo absorve o caso: o "resumo" vira uma tela de resultado (HTML/componente de frontend), consumindo a mesma estrutura de dados que hoje alimenta `report.json` — o dado sobrevive (BR-MIGRAR-016), só a camada de apresentação em texto de terminal desaparece.
- **Reposição no sistema novo**: componente de UI (tela de resumo/dashboard), fora do escopo desta migração de regras de negócio — nota para o Screen Translator, ainda que o legado não tenha telas a traduzir literalmente (é uma tela nova).
- **Risco de descartar**: baixo — nenhuma informação é perdida, apenas a forma de apresentação.

## Itens descartados por mudança de paradigma (subseção dedicada)

| ID | Origem | Paradigma legado | Substituto no paradigma alvo |
|---|---|---|---|
| BR-DESCARTAR-001 | `arquivo-de-configuracao/design.md` | Prompt de terminal síncrono reagindo a chave ausente | Validação de formulário + defaults explícitos na UI, coletados antes do job iniciar |
| BR-DESCARTAR-002 | `arquivo-de-configuracao/decisions.md` (ADR-0007) | Prompt reativo a erro de conexão (1049) | Checkbox declarado antecipadamente no formulário; job falha com mensagem clara se não autorizado |
| BR-DESCARTAR-003 | `arquivo-de-configuracao/requirements.md` (RF-05) | Arquivo de configuração texto comentado, editado fora da ferramenta | Tooltips/help text inline no formulário web |
| BR-DESCARTAR-005 | `relatorios-de-migracao/design.md` | Renderização de tabela em terminal (`rich`) | Tela/componente de UI consumindo a mesma estrutura de dados do relatório |

## Notas

Nenhum item foi descartado por incompatibilidade com o `migration_brief.md` (escopo, restrições) — todas as 5 features do legado permanecem no escopo, como declarado pelo operador. Todos os descartes têm origem na mudança de superfície de interação (CLI → web), não em mudança de regra de negócio: em nenhum caso uma capacidade de negócio real deixou de existir, apenas o mecanismo de coleta/apresentação mudou de forma. Isso é consistente com a decisão de paradigma híbrido/balanced registrada em `paradigm_decision.md` — o pipeline de negócio interno não foi tocado, só a casca de interação.
