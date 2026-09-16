# Investigation: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`

## Pesquisa de fundo

Esta feature não introduz dependência externa nova de peso (sem biblioteca de UI, roteador ou state manager nomeado aqui — decisão de stack concreta de frontend fica para o `/reversa-coding`, para não prescrever solução dentro do `requirements.md`/`roadmap.md`, conforme regra de "SoluçãoImplícita" do Reversa). A investigação aqui cobre padrões de interação e trade-offs arquiteturais, não escolha de framework.

## Padrões aplicáveis

### Wizard multi-step com preview intermediário

Padrão já validado pelo próprio domínio: o CLI legado (`migrate_routines.py`) fazia exatamente essa sequência — perguntas → preview de compatibilidade → confirmação — só que de forma síncrona e bloqueante no terminal (`ask`/`confirm`, `code-analysis.md`). O wizard web reproduz a mesma sequência lógica como etapas de formulário, com o preview virando uma chamada de API (`POST /{feature}/preview`) em vez de uma função chamada in-process. Não há padrão externo a pesquisar aqui — é a mesma máquina de estados do domínio, só trocando I/O de terminal por I/O de rede.

### Acompanhamento de job assíncrono: polling vs. push

- **Polling simples (escolhido, D-02 do `roadmap.md`)**: a tela de acompanhamento chama `GET /{feature}/jobs/:id` em intervalo fixo até status terminal. Simples de implementar, sem infraestrutura nova, e o próprio backend já foi desenhado para isso (AD-01 de `target_architecture.md`: "sem fila/broker externo").
- **Alternativas descartadas**:
  - *Server-Sent Events (SSE)*: dado que Fastify suporta streaming de resposta nativamente, seria viável sem biblioteca nova — mas exigiria manter uma conexão HTTP aberta por job em andamento, o que é complexidade operacional desproporcional para o volume de uso interno declarado no brief.
  - *WebSocket*: mesmo raciocínio, com custo ainda maior (protocolo bidirecional não é necessário — a UI só *lê* progresso, nunca envia comando durante o job).
- Ambas as alternativas foram descartadas pela mesma razão que already levou o backend a não usar fila real: a decisão híbrida de paradigma (`_reversa_sdd/migration/paradigm_decision.md`) prioriza simplicidade operacional sobre a "naturalidade" de Node.js para eventos.

### Design do endpoint de relatório (RF-10 / D-03 / D-04)

- **Endpoint único com `?format=`** (escolhido): um contrato HTTP, um serializador, quatro representações. Reduz a chance de divergência entre formatos (o próprio risco que motivou a decisão de revisão em `_reversa_sdd/relatorios-de-migracao/design.md`: "consolidar sob serializador único").
- **Alternativa descartada — 4 rotas dedicadas** (`/report.json`, `/report.html`, `/report.sql`, `/report-retry.sql`): mais próximo do artefato legado (3-4 arquivos físicos gerados por `save_report`), mas reintroduz a superfície de manutenção que a decisão de revisão já rejeitou.
- **Fonte de dados**: diferente do legado (que montava `report_data` a partir de listas em memória, `routine_results`/`table_results`, dentro do mesmo processo de `main()`), o novo endpoint monta o equivalente a partir de linhas já persistidas em `job_items`/`job_item_fk_specs` (App DB) — o job pode ter rodado minutos ou dias antes da consulta ao relatório, algo que o CLI nunca precisou suportar (era tudo síncrono numa única execução de processo).

## Links para fontes externas

Nenhum. Toda a base de decisão vem de artefatos internos já produzidos pelo Reversa (`_reversa_sdd/`, `_reversa_sdd/migration/`) e do código-fonte já implementado em `src/`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-plan` | reversa |
