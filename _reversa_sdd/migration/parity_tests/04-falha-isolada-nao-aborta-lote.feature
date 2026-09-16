# language: pt
# spec-id: PT-004
# rastreabilidade:
#   process_flows: _reversa_sdd/migracao-de-rotinas/design.md e migracao-de-tabelas/design.md § Fluxos Alternativos
#   target_architecture: AGG-MigrationJob (target_domain_model.md) — invariante de isolamento de falha por item
#   paradigma_alvo: híbrido/balanced — equivalência funcional padrão (robustez independe de paradigma)

Funcionalidade: Isolamento de falha por item dentro de um job de migração
  Como operador da ferramenta de migração
  Quero que a falha ao aplicar uma rotina ou tabela específica não interrompa o processamento das demais
  Para que um único item problemático não bloqueie toda a migração

  @paridade @critico
  Cenário: Erro de aplicação numa tabela não impede a migração das demais
    Dado um job selecionando 3 tabelas, sendo que a segunda tem um erro de aplicação não relacionado a FK (ex: erro de sintaxe)
    Quando o job é executado
    Então a primeira e a terceira tabela são aplicadas com sucesso
    E a segunda tabela é registrada com "apply_error" preenchido e "applied = false"
    E o job como um todo não é marcado como "failed" só por causa desse item (AGG-MigrationJob, invariante)
    E o comportamento é idêntico ao do CLI legado, onde o `for` sequencial de `main()` simplesmente segue para o próximo item

  @paridade
  Cenário: Retry manual via script gerado continua disponível
    Dado um job com pelo menos uma rotina e uma tabela com erro, ambas com DDL corrigido disponível
    Quando o relatório final é gerado
    Então "retry_routines.sql" e "retry_tables.sql" são gerados com os itens que falharam
    E "retry_tables.sql" inclui "DROP TABLE IF EXISTS" antes de cada CREATE; "retry_routines.sql" não precisa dessa cláusula (BR-MIGRAR-018)
