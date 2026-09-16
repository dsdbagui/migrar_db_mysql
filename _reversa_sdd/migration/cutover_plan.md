---
schemaVersion: 1
generatedAt: 2026-09-15T20:00:00Z
reversa:
  version: "1.3.3"
kind: cutover_plan
producedBy: strategist
hash: "sha256:a2bb3e7c34e7985076b6847228179747adc6439a2d6a04ddc6f9de2424e5ed1c"
---

# Cutover Plan

> Plano de corte do legado para o sistema novo, alinhado à estratégia escolhida em `migration_strategy.md`.
> Construído sobre a estratégia recomendada (A + B — Strangler Fig por feature, com Parallel Run para `migracao-de-tabelas`/`migracao-de-rotinas`). Se o operador escolher uma estratégia diferente na decisão humana, este plano deve ser revisado antes da execução.

## Estratégia base
- **Estratégia confirmada**: A + B — Strangler Fig por feature + Parallel Run para `migracao-de-tabelas`/`migracao-de-rotinas`, confirmada pelo operador em 2026-09-15 (ver `migration_strategy.md` § Decisão humana).

## Pré-requisitos
- [ ] Versão web cobre a feature em questão com paridade funcional às specs de `_reversa_sdd/<feature>/requirements.md` (RF-* com status "implementado").
- [ ] Para `migracao-de-tabelas` e `migracao-de-rotinas`: Parallel Run executado contra pelo menos 1 banco de teste representativo, com resultado (schema + contagem de linhas + issues) idêntico entre CLI legado e versão web.
- [ ] Cofre de credenciais (BR-HUMANA-002) implementado e validado antes de qualquer cutover que dependa dele.
- [ ] Área de Infraestrutura (stakeholder único do brief) comunicada e ciente de qual feature está migrando.

## Janela de cutover
- **Data alvo**: a definir pela Área de Infraestrutura — não há prazo declarado no `migration_brief.md`.
- **Duração estimada**: por feature (Strangler Fig é incremental, não um corte único) — cada corte individual deve durar o tempo de uma execução completa de teste + confirmação do operador, tipicamente menos de 1 dia útil.
- **Ambiente afetado**: nenhum ambiente de produção com tráfego contínuo — a ferramenta é operada sob demanda; "cutover" aqui significa "o operador passa a usar a web em vez do CLI para essa feature", não uma virada de tráfego de usuários finais.
- **Comunicação prévia**: Área de Infraestrutura avisada a cada feature liberada na web (ver RISK-006 em `risk_register.md`).

## Passos do cutover (por feature)

| # | Passo | Owner | Duração | Reversível? |
|---|---|---|---|---|
| 1 | Confirmar que a feature na web passou nos testes automatizados equivalentes às `tasks.md` da feature legado | Agente de codificação | — | sim |
| 2 | Rodar a feature na web contra um banco de teste/staging e comparar resultado com o CLI legado rodando a mesma migração (obrigatório para `migracao-de-tabelas`/`migracao-de-rotinas`; recomendado para as demais) | Agente de codificação + Área de Infraestrutura | 1 execução completa | sim |
| 3 | Comunicar à Área de Infraestrutura que a feature X está disponível na web | Agente de codificação | — | n/a |
| 4 | Operador passa a usar a web para novas migrações dessa feature; CLI legado permanece disponível como fallback | Área de Infraestrutura | contínuo | sim (basta voltar a usar o CLI) |
| 5 | Repetir os passos 1-4 para a próxima feature, na ordem sugerida em `risk_register.md` (RISK-007): `migracao-de-tabelas` e `migracao-de-rotinas` primeiro | Agente de codificação | — | sim |

## Plano de rollback
- **Critérios de acionamento**: qualquer discrepância encontrada entre o resultado da web e o resultado esperado (schema incompleto, dados faltantes, FK não recuperada corretamente) numa migração real (não apenas de teste).
- **Passos**:
  1. Interromper o uso da versão web para a feature afetada — comunicar à Área de Infraestrutura para retomar o CLI legado imediatamente.
  2. Se a migração real já foi parcialmente aplicada ao banco de destino pela web, usar os artefatos de relatório gerados (`report.json`, `retry_*.sql`) para avaliar o que precisa de correção manual ou reprocessamento via CLI legado.
  3. Registrar o incidente como um novo risco/lição aprendida antes de tentar reativar a feature na web.
- **Tempo máximo aceitável até rollback**: imediato — como o CLI legado nunca é desativado durante a Estratégia A, o rollback é apenas "parar de usar a web para essa feature", sem necessidade de reverter infraestrutura.
- **Owner do rollback**: Área de Infraestrutura (decide) + agente de codificação (executa correção).

## Critérios de go / no-go
- **Go**:
  - Testes automatizados da feature (equivalentes às `tasks.md` do legado) passando.
  - Parallel Run sem divergência, para as features de maior risco.
  - Cofre de credenciais operacional, se a feature depender de conexão MySQL (todas dependem).
- **No-go**:
  - Qualquer divergência não explicada entre resultado da web e do CLI legado no Parallel Run.
  - Preview (dry-run) divergindo do resultado real da aplicação (RISK-003).

## Pós-cutover
- [ ] Monitoramento estendido por pelo menos 2-3 execuções reais adicionais após o primeiro uso em produção de cada feature, antes de considerar o CLI legado dispensável para ela.
- [ ] Validação de paridade conforme `parity_specs.md` (a ser produzido pelo Inspector).
- [ ] Decommission do CLI legado somente após todas as 5 features estarem estáveis na web por um período acordado com a Área de Infraestrutura — sem data definida neste plano, dado que o brief não declarou prazo.

## Notas
Diferente de um cutover clássico (virada de tráfego de um serviço vivo), esta migração tem a vantagem de que o "sistema antigo" é uma ferramenta CLI operada sob demanda, não um serviço com usuários simultâneos — isso reduz drasticamente o risco de "janela de corte" e permite que a Estratégia A (Strangler Fig) seja executada com baixíssima pressão de tempo, feature por feature, sem necessidade de coordenar uma parada programada.
