# language: pt
# spec-id: PT-003
# rastreabilidade:
#   process_flows: _reversa_sdd/migracao-de-tabelas/requirements.md § Critérios de Aceitação; ADR-0006
#   target_architecture: features/tables (ColumnDefault, target_domain_model.md)
#   paradigma_alvo: híbrido/balanced — equivalência funcional padrão

Funcionalidade: Substituição de NULL por valor padrão configurado ao copiar dados
  Como operador da ferramenta de migração
  Quero que uma linha de origem com NULL numa coluna NOT NULL do destino seja copiada com um valor de fallback
  Para que a cópia de dados não falhe por violação de sql_mode estrito

  @paridade @critico
  Cenário: Linha com NULL é copiada com o valor configurado, e o DEFAULT fica no schema
    Dado uma tabela de origem com uma linha contendo NULL numa coluna "status" que é NOT NULL no destino
    E o operador configurou o valor padrão "pendente" para "tabela.status"
    Quando os dados são copiados
    Então a linha é inserida com "pendente" no lugar do NULL, sem erro de sql_mode estrito
    E a coluna "status" do destino fica com "pendente" como DEFAULT real (ALTER TABLE ... SET DEFAULT)
    E o resultado é idêntico ao produzido pelo CLI legado para a mesma tabela/coluna/valor (BR-MIGRAR-008)

  @paridade
  Cenário: Valor "hoje" resolve para a data atual
    Dado o operador configurou o valor padrão "hoje" para uma coluna de data
    Quando a coluna é resolvida antes da cópia
    Então o valor aplicado é a data atual no formato ISO (YYYY-MM-DD), idêntico ao comportamento de `_resolve_default_value` do legado

  @paridade
  Cenário: Falha isolada de SET DEFAULT numa coluna gera Issue visível (divergência deliberada do legado)
    Dado uma coluna configurada com column_defaults cujo ALTER TABLE SET DEFAULT falha (ex: tipo incompatível)
    Quando a migração da tabela prossegue
    Então a falha não aborta as demais colunas nem a cópia de dados da tabela
    E uma Issue de severidade "warning" com código "COLUMN_DEFAULT_FAILED" é registrada no resultado da tabela
    E essa Issue aparece em report.json/report.html — diferente do legado, que só emitia um aviso de terminal (BR-MIGRAR-011, RF-10)
