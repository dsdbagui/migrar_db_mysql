# User Story — Corrigir collation pós-migração

> Fonte: `correcao-de-collation/requirements.md`, `code-analysis.md` (Feature: correcao-de-collation), `domain.md` ("Sobre o 'carimbo' de collation"), ADR-0005.
> Unit relacionada: `correcao-de-collation/`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## História

**Como** um DBA que já migrou o banco e, em seguida, converteu o collation do schema (ex: para `utf8mb4_0900_ai_ci`, padrão do MySQL 8),
**Eu quero** recarimbar automaticamente o `DATABASE_COLLATION` das procedures/functions que ainda referenciam o collation antigo,
**Para que** rotinas armazenadas não fiquem com um metadado de collation desatualizado e silenciosamente inconsistente com o schema que as contém. 🟢

## Contexto de negócio

`DATABASE_COLLATION` é um metadado carimbado no momento da criação da rotina — não é atualizado automaticamente quando o collation do banco muda depois; só um novo `CREATE` re-carimba (ver `domain.md`). O script é uma ferramenta **separada e posterior** a uma migração: pressupõe que o schema já foi convertido (`ALTER DATABASE ... COLLATE ...`) como etapa anterior e distinta, e se recusa a rodar se essa conversão ainda não aconteceu — uma guarda que sugere que essa ordem de operações já causou confusão/erro de uso no passado. 🟡

## Personas

| Persona | Papel | Motivação |
|---|---|---|
| DBA/Operador | Roda `fix_collation_stamp.py` manualmente após confirmar que o schema já foi convertido | Eliminar rotinas com metadado de collation desatualizado, sem precisar recriar cada uma manualmente 🟢 |

Script independente de `migrate_routines.py` (sem import cruzado) — mesma persona da história de migração, mas em um momento posterior e distinto do fluxo. 🟢

## Cenários

```gherkin
Cenário: Recarimbar rotinas com collation desatualizado
  Dado que o schema já foi convertido para o collation novo (ex: utf8mb4_0900_ai_ci)
    E existem 3 rotinas com DATABASE_COLLATION ainda carimbado como utf8mb4_unicode_ci
  Quando o operador confirma a recriação
  Então as 3 rotinas são recriadas via DROP + CREATE, sem DEFINER
    E a verificação pós-execução não encontra mais nenhuma rotina com collation antigo

Cenário: Impedir execução fora de ordem
  Dado que o schema ainda está com o collation antigo (utf8mb4_unicode_ci)
  Quando o operador executa o script
  Então o script avisa que o banco precisa ser convertido primeiro e encerra com sys.exit(1)
    E nenhuma rotina é lida, listada ou alterada

Cenário: Rotina com problema de compatibilidade MySQL 8 ainda não corrigido
  Dado uma rotina com DATABASE_COLLATION desatualizado que também contém um padrão incompatível com MySQL 8 (ex: SET OPTION)
  Quando o script tenta recriá-la
  Então a recriação falha para essa rotina especificamente, capturada como erro individual
    E as demais rotinas do lote continuam sendo processadas normalmente

Cenário: Salvar log de auditoria da execução
  Dado que a recriação de rotinas foi confirmada e concluída
  Quando o operador opta por salvar o log
  Então log.json e recreated.sql são gerados
    E, se alguma rotina falhou, retry_errors.sql também é gerado
```

## Critérios de aceite (resumo)

- Credenciais de `.env` são usadas sem perguntar interativamente quando presentes. 🟢
- Script recusa executar se `get_current_db_collation() == OLD_COLLATION`. 🟢
- Toda procedure/function com `DATABASE_COLLATION` desatualizado é localizada, cobrindo `PROCEDURE` e `FUNCTION`. 🟢
- Nenhum `DROP`/`CREATE` ocorre sem confirmação explícita do operador. 🟢
- Erro ao recriar uma rotina não interrompe o processamento das demais. 🟢
- Verificação pós-execução relista rotinas remanescentes com collation antigo, se houver. 🟢

## Limitações conhecidas

- `OLD_COLLATION = "utf8mb4_unicode_ci"` é fixo no código-fonte — não configurável via `.env` ou CLI; migrar de/para outro par de collations exige editar o script. 🟢
- O script não aplica nenhuma das `TRANSFORMATIONS` de `migrate_routines.py` — a única alteração de DDL é a remoção do `DEFINER`. 🟢
- Falha ao salvar o log em disco não tem fallback de diretório (diferente de `save_report` em `relatorios-de-migracao`). 🟡

## Fora de escopo desta história

- Conversão do collation do schema em si (`ALTER DATABASE ... COLLATE ...`) — pré-requisito externo a este script, não implementado por ele.
- Migração inicial de rotinas/tabelas — ver [Migrar schema e dados](migrar-schema-e-dados.md).

## Rastreabilidade

| Unit | Requisitos cobertos |
|---|---|
| `correcao-de-collation/` | RF-01 a RF-08 (`requirements.md`) |
