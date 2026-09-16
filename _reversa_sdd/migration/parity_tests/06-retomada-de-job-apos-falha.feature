# language: pt
# spec-id: PT-006
# rastreabilidade:
#   process_flows: sem equivalente direto no legado (script síncrono, sem conceito de job) — cenário novo introduzido pela decisão híbrida de paradigma
#   target_architecture: Core — Job Runner (target_architecture.md § AD-01); job_items (target_data_model.md)
#   paradigma_alvo: híbrido/balanced — dimensão de idempotência de retomada de job (paradigm_decision.md, implicação 4; risk_register.md RISK-004)

Funcionalidade: Retomada de job de migração após interrupção do processo
  Como operador da ferramenta de migração
  Quero que um job interrompido por queda do servidor não duplique efeitos nem perca rastro do progresso
  Para confiar na migração mesmo sem a garantia de execução ininterrupta que o CLI legado tinha (processo síncrono de ponta a ponta)

  @idempotencia @critico
  Cenário: Job interrompido no meio da cópia de dados de uma tabela não duplica linhas ao retomar
    Dado um job de migração de tabela com cópia de dados em andamento, com 2 de 5 tabelas já concluídas (job_items com status terminal)
    Quando o processo do servidor é reiniciado no meio da cópia da 3ª tabela
    E o job é retomado a partir do progresso persistido
    Então as 2 tabelas já concluídas não são reprocessadas
    E a 3ª tabela é reprocessada do início de forma segura (sem duplicar linhas já copiadas, ou recomeçando a tabela de forma idempotente)
    E o resultado final é equivalente a uma execução ininterrupta do CLI legado para a mesma entrada

  @paridade
  Cenário: Consulta de progresso reflete o estado real mesmo após reinício
    Dado um job em andamento antes de um reinício do servidor
    Quando o operador consulta o status do job após o reinício
    Então o status reportado reflete corretamente quais itens já foram processados (via job_items), não um estado indefinido
    E isso é uma capacidade nova que o legado não tinha (o legado não sobrevivia a uma queda de processo — o operador só via o que tinha rolado no terminal)
