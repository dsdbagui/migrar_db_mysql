# correcao-de-collation

> Fonte: `code-analysis.md` (Feature: correcao-de-collation), `data-dictionary.md` (seção `fix_collation_stamp.py`), `domain.md` ("Sobre o 'carimbo' de collation"), `flowcharts/correcao-de-collation.md`, ADR-0005.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão Geral

Ferramenta de manutenção pós-migração, standalone (`fix_collation_stamp.py`, sem import cruzado com `migrate_routines.py`), que recria procedures/functions cujo `DATABASE_COLLATION` ainda está carimbado com o collation antigo (`utf8mb4_unicode_ci`), depois que o schema já foi convertido para um collation novo (ex: `utf8mb4_0900_ai_ci`, padrão do MySQL 8). O `DROP`+`CREATE` faz o MySQL re-carimbar automaticamente o `DATABASE_COLLATION` corrente da rotina. 🟢

## Responsabilidades

- Ler credenciais via `.env` (mesma pasta do script) ou, na ausência, perguntar interativamente. 🟢
- Verificar o collation atual do schema (`information_schema.SCHEMATA.DEFAULT_COLLATION_NAME`) e recusar-se a rodar se o banco ainda não foi convertido para um collation novo. 🟢
- Localizar procedures e functions cujo `DATABASE_COLLATION` ainda é o antigo (`OLD_COLLATION = "utf8mb4_unicode_ci"`, constante fixa). 🟢
- Listar as rotinas encontradas e pedir confirmação antes de qualquer alteração. 🟢
- Recriar cada rotina (`SHOW CREATE` → remove `DEFINER` → `DROP ... IF EXISTS` → `CREATE`), capturando sucesso/erro por rotina sem abortar o lote. 🟢
- Rodar uma verificação pós-execução (repete a busca por collation antigo) para confirmar que nada ficou desatualizado. 🟢
- Salvar, opcionalmente, um log em disco (`log.json`, `recreated.sql`, e `retry_errors.sql` se houver falha). 🟢

## Regras de Negócio

- `DATABASE_COLLATION` é um metadado carimbado no momento da criação da rotina — não é atualizado automaticamente quando o collation do banco muda depois; só um novo `CREATE` re-carimba. 🟢 Ver `domain.md`, "Carimbo de collation".
- O script recusa-se a rodar se o collation atual do banco ainda for `OLD_COLLATION` — pressupõe que a conversão do schema (`ALTER DATABASE ... COLLATE ...`) já foi feita como etapa anterior e separada. 🟡 Essa guarda sugere que a ordem de operações (converter banco primeiro, rodar depois) já causou confusão/erro de uso no passado.
- Nenhuma das `TRANSFORMATIONS` de `migrate_routines.py` é aplicada aqui — a única alteração de DDL é a remoção do `DEFINER`; o re-carimbo do collation é efeito colateral do `DROP`+`CREATE`, não de uma instrução SQL direta. 🟢
- Como consequência de não aplicar `TRANSFORMATIONS`, se uma rotina tiver algum problema de compatibilidade MySQL 8 não corrigido anteriormente, `recreate_routine` falha ao recriá-la — capturado como erro individual, não aborta o lote. 🟡
- `OLD_COLLATION` é fixo no código-fonte (`fix_collation_stamp.py:57`) — não configurável via `.env` ou argumento CLI; migrar de/para outro par de collations exige editar o código-fonte. 🟢
- Falha ao salvar o log em disco não é tratada com fallback (diferente de `save_report` em `relatorios-de-migracao`) — não há guarda de `PermissionError`/`OSError` em `save_log`. 🟡

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Carregar credenciais de `.env` quando presente, sem perguntar interativamente | Must | Se `.env` tem `DB_HOST`/`DB_USER`/`DB_PASSWORD`, os prompts interativos de conexão são pulados |
| RF-02 | Recusar execução se o banco ainda estiver com o collation antigo | Must | `get_current_db_collation() == OLD_COLLATION` interrompe o script com `sys.exit(1)` antes de qualquer alteração |
| RF-03 | Localizar todas as procedures/functions com `DATABASE_COLLATION` desatualizado | Must | `find_stale_routines` retorna todas as rotinas com `DATABASE_COLLATION = OLD_COLLATION`, cobrindo `PROCEDURE` e `FUNCTION` |
| RF-04 | Exigir confirmação explícita antes de recriar rotinas | Must | Nenhum `DROP`/`CREATE` ocorre sem `confirm(...)` retornar verdadeiro |
| RF-05 | Recriar cada rotina removendo `DEFINER`, sem aplicar outras transformações | Must | DDL recriado é idêntico ao original exceto pela ausência do `DEFINER`; nenhuma outra reescrita é aplicada |
| RF-06 | Continuar o lote mesmo se uma rotina individual falhar ao recriar | Should | Erro em uma rotina não interrompe o processamento das demais; resultado por rotina é registrado em `results` |
| RF-07 | Verificar pós-execução se ainda restam rotinas com collation antigo | Should | `find_stale_routines` é chamado novamente após o loop; rotinas remanescentes são listadas com aviso |
| RF-08 | Salvar log opcional em disco com DDLs recriados e, se houver falha, script de retry | Could | `log.json` e `recreated.sql` sempre gerados quando confirmado; `retry_errors.sql` só quando há rotina com erro |
| RF-09 🆕 | Proteger contra perda de rotina quando `DROP` é commitado mas `CREATE` subsequente falha — via transação atômica ou backup do DDL original com restauração automática. Decidido em revisão de 2026-09-15 (`../questions.md#pergunta-10`); divergência deliberada do legado, que não tem essa salvaguarda | Must | Falha simulada no `CREATE` após `DROP` bem-sucedido nunca deixa a rotina ausente do banco — ela é restaurada automaticamente ou a operação inteira é revertida |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Disponibilidade | Falha ao recriar uma rotina não aborta o lote; cada rotina é isolada em seu próprio try/except | `fix_collation_stamp.py:230-259` (`recreate_routine`) | 🟢 |
| Segurança operacional | Guarda dupla contra execução fora de ordem: pré-checagem (collation do banco ainda antigo) e pós-checagem (rotinas remanescentes) | `fix_collation_stamp.py:374-378`, `:452-460` | 🟢 |
| Portabilidade | Script totalmente independente de `migrate_routines.py`, sem import cruzado — duplica seus próprios helpers | `fix_collation_stamp.py` inteiro; ver ADR-0005 | 🟢 |
| Auditabilidade | Log opcional em disco com DDLs recriados e, em caso de falha, script de retry isolado | `fix_collation_stamp.py:266-321` (`save_log`) | 🟢 |

> Inferido a partir do código. Sem requisitos de performance explícitos — o script processa rotinas sequencialmente, sem paralelismo ou lote em batch.

## Critérios de Aceitação

```gherkin
Dado que o schema já foi convertido para o collation novo (ex: utf8mb4_0900_ai_ci)
  E existem 3 rotinas com DATABASE_COLLATION ainda carimbado como utf8mb4_unicode_ci
Quando o operador confirma a recriação
Então as 3 rotinas são recriadas via DROP + CREATE, sem DEFINER
  E a verificação pós-execução não encontra mais nenhuma rotina com collation antigo

Dado que o schema ainda está com o collation antigo (utf8mb4_unicode_ci)
Quando o operador executa o script
Então o script avisa que o banco precisa ser convertido primeiro e encerra com sys.exit(1)
  E nenhuma rotina é lida, listada ou alterada
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|----------------|
| Guarda de collation ainda antigo (RF-02) | Must | Proteção central do script — evita rodar fora de ordem |
| Localização e recriação de rotinas desatualizadas (RF-03, RF-05) | Must | Propósito único do script |
| Confirmação explícita (RF-04) | Must | Operação destrutiva (`DROP`) sobre rotinas de produção |
| Resiliência por rotina (RF-06) | Should | Evita que uma rotina problemática bloqueie as demais |
| Verificação pós-execução (RF-07) | Should | Reforça a garantia de que a correção teve efeito, mas não é a ação principal |
| Log em disco (RF-08) | Could | Conveniência de auditoria — script funciona sem ele |
| Salvaguarda contra perda de rotina (RF-09) 🆕 | Must | Sem ela, uma falha de `CREATE` pós-`DROP` remove permanentemente uma rotina de produção — inaceitável, confirmado em revisão |

> Prioridade inferida por centralidade no propósito da ferramenta (correção pontual de um metadado) e pela natureza destrutiva da operação (`DROP`).

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `fix_collation_stamp.py:64` | `load_env` | 🟢 |
| `fix_collation_stamp.py:144` | `connect` | 🟢 |
| `fix_collation_stamp.py:165` | `find_stale_routines` | 🟢 |
| `fix_collation_stamp.py:189` | `get_current_db_collation` | 🟢 |
| `fix_collation_stamp.py:205` | `get_ddl` | 🟢 |
| `fix_collation_stamp.py:230` | `recreate_routine` | 🟢 |
| `fix_collation_stamp.py:266` | `save_log` | 🟢 |
| `fix_collation_stamp.py:328` | `main` | 🟢 |
