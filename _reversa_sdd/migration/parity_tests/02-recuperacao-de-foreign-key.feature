# language: pt
# spec-id: PT-002
# rastreabilidade:
#   process_flows: _reversa_sdd/migracao-de-tabelas/requirements.md § Critérios de Aceitação; ADR-0002
#   target_architecture: features/tables — FK Recovery Engine (target_architecture.md § BC-01)
#   paradigma_alvo: híbrido/balanced — ordem determinística preservada (paradigm_decision.md, implicação 2)

Funcionalidade: Recuperação automática de foreign key problemática
  Como operador da ferramenta de migração
  Quero que uma tabela com FK apontando para coluna sem UNIQUE KEY no destino seja criada mesmo assim
  Para não travar a migração inteira por causa de uma FK mal formada, e recuperar a integridade depois

  @paridade @critico
  Cenário: FK própria é removida e restaurada após a carga de dados
    Dado uma tabela de origem "pedidos" com FK para "clientes" cuja coluna referenciada não tem UNIQUE KEY no destino
    Quando o operador seleciona "pedidos" e "clientes" para migração com cópia de dados
    Então o CREATE TABLE inicial de "pedidos" falha com erro 1215/6125
    E o sistema remove a FK problemática automaticamente e recria "pedidos" com sucesso
    E a FK removida fica registrada como pendente (fk_specs / job_item_fk_specs)
    Quando todas as tabelas e dados já foram migrados
    E a coluna referenciada em "clientes" não tem valores duplicados
    Então uma UNIQUE KEY é criada em "clientes" e a FOREIGN KEY original é recriada em "pedidos"
    E o resultado da tabela recebe a issue "FK_RESTORED" (info)
    E o schema final da versão nova é estruturalmente idêntico ao schema final produzido pelo CLI legado para a mesma entrada (RISK-001 em risk_register.md)

  @paridade
  Cenário: FK pendente com duplicata não é restaurada, sem abortar a execução
    Dado uma FK removida pendente de restauração
    E a coluna referenciada tem valores duplicados no momento da tentativa de restauração
    Quando o sistema tenta restaurar a FK
    Então a UNIQUE KEY não é criada e a FK permanece "FK_NOT_RESTORED" (warning)
    E a execução do job continua normalmente, sem abortar (BR-MIGRAR-010)

  @ordem
  Cenário: Ordem determinística tabelas → FKs pendentes → rotinas é preservada
    Dado uma migração selecionando tabelas e rotinas na mesma execução
    Quando o job roda em background (não mais dentro de um `for` síncrono como no legado)
    Então todas as tabelas são criadas e têm dados copiados antes de qualquer tentativa de restaurar FK pendente
    E a restauração de FK pendente acontece antes do processamento de rotinas
    E essa ordem é idêntica à ordem observada no CLI legado para a mesma seleção de itens
