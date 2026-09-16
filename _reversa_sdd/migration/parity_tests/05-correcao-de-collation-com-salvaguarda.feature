# language: pt
# spec-id: PT-005
# rastreabilidade:
#   process_flows: _reversa_sdd/correcao-de-collation/requirements.md § Critérios de Aceitação; RF-09 (novo)
#   target_architecture: features/collation-fix (target_architecture.md § BC-04)
#   paradigma_alvo: híbrido/balanced — equivalência funcional padrão + robustez transacional nova

Funcionalidade: Correção de carimbo de collation com salvaguarda contra perda de rotina
  Como operador da ferramenta de migração
  Quero recriar rotinas com DATABASE_COLLATION desatualizado sem risco de perdê-las se o CREATE falhar
  Para não ficar com uma rotina de produção ausente do banco por causa de uma falha transitória

  @paridade @critico
  Cenário: Banco ainda não convertido recusa a execução
    Dado que o collation atual do banco ainda é o antigo ("utf8mb4_unicode_ci")
    Quando o operador executa a correção de collation
    Então o sistema recusa a execução com uma mensagem orientando a conversão prévia do schema
    E nenhuma rotina é lida, listada ou alterada — idêntico ao comportamento do CLI legado (RF-02)

  @paridade @critico
  Cenário: Rotinas desatualizadas são recriadas com sucesso
    Dado que o schema já foi convertido para o collation novo
    E existem 3 rotinas com DATABASE_COLLATION ainda carimbado como o antigo
    Quando o operador confirma a recriação
    Então as 3 rotinas são recriadas via DROP + CREATE, sem DEFINER
    E a verificação pós-execução não encontra mais nenhuma rotina com collation antigo

  @paridade @critico
  Cenário: Falha no CREATE após DROP bem-sucedido não deixa a rotina ausente (divergência deliberada do legado)
    Dado uma rotina cujo DROP é bem-sucedido mas o CREATE subsequente falha (ex: incompatibilidade não corrigida)
    Quando a recriação é tentada
    Então a rotina original é restaurada automaticamente (via backup do DDL) ou a operação inteira é revertida numa transação atômica
    E em nenhum momento a rotina fica ausente do banco de destino
    E este comportamento é uma melhoria deliberada sobre o legado, que deixava a rotina ausente até correção manual (RF-09, BR-MIGRAR-021)
