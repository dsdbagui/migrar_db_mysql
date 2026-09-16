# language: pt
# spec-id: PT-001
# rastreabilidade:
#   process_flows: _reversa_sdd/migracao-de-rotinas/requirements.md § Critérios de Aceitação; code-analysis.md
#   target_architecture: features/routines (target_architecture.md § Componentes)
#   paradigma_alvo: híbrido/balanced (paradigm_decision.md) — equivalência funcional padrão, sem dimensão de evento

Funcionalidade: Migração de procedure/function com correção de compatibilidade
  Como operador da ferramenta de migração
  Quero migrar uma rotina armazenada do MySQL 5.x para o 8.x com o DEFINER removido e incompatibilidades corrigidas
  Para que a rotina funcione no destino sem reintroduzir o dono original nem sintaxe obsoleta

  @paridade @critico
  Cenário: Rotina com DEFINER e SET OPTION migra com sucesso
    Dado um banco de origem com uma procedure "sp_exemplo" contendo "DEFINER=`usuario_antigo`@`%`" e "SET OPTION SQL_MODE=''"
    E o operador seleciona "sp_exemplo" para migração
    Quando a migração é aplicada sem "new_definer" configurado
    Então a procedure é criada no destino sem a cláusula DEFINER original
    E a cláusula "SET OPTION" é substituída por "SET"
    E o resultado registrado tem "applied = true"
    E o DDL final da versão nova é byte-idêntico ao DDL final produzido pelo CLI legado para a mesma entrada (BR-MIGRAR-001, BR-MIGRAR-002)

  @paridade
  Cenário: Rotina sem DDL extraído é pulada sem abortar as demais
    Dado uma rotina cujo DDL não pôde ser extraído (privilégio insuficiente)
    Quando o operador tenta migrar essa rotina junto com outras 2 rotinas válidas
    Então ela é marcada "skipped = true", com mensagem explicando "DDL indisponível"
    E as outras 2 rotinas continuam sendo processadas e aplicadas normalmente (BR-MIGRAR-003)
