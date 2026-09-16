# migracao-de-rotinas

> Fonte: `code-analysis.md` (Feature: migracao-de-rotinas), `domain.md`, `state-machines.md`, `permissions.md`, `data-dictionary.md`, ADR-0001.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

## Visão Geral

Extrai procedures e functions armazenadas de um MySQL 5.x de origem, corrige incompatibilidades sintáticas conhecidas com o MySQL 8.x via um pipeline de transformações de DDL por regex, e aplica o DDL corrigido num MySQL 8.x de destino — de forma interativa (ou dirigida por `--config`), rotina por rotina, com relatório dos problemas encontrados/corrigidos. 🟢

## Responsabilidades

- Extrair metadados e DDL completo de cada procedure/function do banco de origem (`fetch_routines`). 🟢
- Detectar e, quando possível, corrigir automaticamente padrões de DDL incompatíveis com MySQL 8 (`transform_routine` + lista `TRANSFORMATIONS`). 🟢
- Remover ou substituir o `DEFINER` original por um `new_definer` único fornecido pelo operador. 🟢
- Aplicar o DDL corrigido no destino, com `DROP ... IF EXISTS` opcional antes do `CREATE`. 🟢
- Registrar, por rotina, o resultado da operação (`applied`/`skipped`/erro) para consumo pelo Report Generator. 🟢

## Regras de Negócio

- O `DEFINER` original é sempre removido por padrão; se `new_definer` não for informado, o MySQL usa o usuário da conexão de destino como definer implícito de todas as rotinas migradas — **decisão de segurança silenciosa** que não é mapeada individualmente por rotina. 🟡 (ver `domain.md`, "Sobre DEFINER e portabilidade entre servidores")
- Correções são automáticas apenas quando são **sintaticamente puras e sem ambiguidade semântica** (`SET OPTION`→`SET`); problemas que exigem decisão de negócio (qual hash substitui `OLD_PASSWORD()`?) ficam como aviso (`warning`) para revisão humana, sem alteração automática. 🟡
- Falha na extração de uma rotina individual (ex: privilégio insuficiente) não aborta o lote inteiro — é capturada como `extract_error` no dict daquela rotina, e a rotina é marcada `skipped` na aplicação. 🟢
- `normalize_delimiter()` não lida com `DELIMITER $$` customizado — não é necessário porque `SHOW CREATE` já retorna o DDL sem delimitador customizado. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Extrair todas as rotinas do banco de origem via `information_schema.ROUTINES` + `SHOW CREATE PROCEDURE/FUNCTION` | Must | Toda rotina existente no banco de origem aparece na lista extraída, com DDL completo ou `extract_error` |
| RF-02 | Permitir seleção de quais rotinas migrar (todas ou lista de nomes exatos) | Must | `select_items`/`routines.select` filtra corretamente por nome |
| RF-03 | Remover ou substituir `DEFINER` de cada rotina antes de aplicar | Must | Nenhuma rotina aplicada no destino mantém o `DEFINER` original |
| RF-04 | Aplicar as 8 transformações de compatibilidade da lista `TRANSFORMATIONS`, em ordem | Must | Cada `Issue` esperada é gerada quando o padrão correspondente está presente no DDL |
| RF-05 | Permitir `drop_existing` (DROP IF EXISTS antes de CREATE) configurável | Should | Rotina já existente no destino é substituída quando `drop_existing=true` |
| RF-06 | Exibir preview de compatibilidade (contagem de erros/avisos) antes de aplicar | Should | Preview reflete exatamente as issues que seriam geradas na aplicação real |
| RF-07 | Registrar resultado por rotina (`applied`/`skipped`/`apply_error`) para o relatório final | Must | `routine_results` contém uma entrada por rotina selecionada, com o campo correto preenchido |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Confiabilidade | Erro de aplicação numa rotina não aborta o lote — `rollback()` isola a falha e o loop continua para a próxima rotina | `migrate_routines.py:728` (`apply_routine`) | 🟢 |
| Confiabilidade | Erro de extração numa rotina individual não aborta a extração do lote | `migrate_routines.py:345` (`fetch_routines`) | 🟢 |
| Auditabilidade | Toda transformação aplicada gera uma `Issue` estruturada, não apenas um log solto | `migrate_routines.py:425` (`Issue`), `:543` (`TRANSFORMATIONS`) | 🟢 |
| Configurabilidade | Todo ponto de decisão interativo tem uma chave `--config` equivalente, permitindo execução não interativa completa | `migrate_routines.py:1544-1685` | 🟢 |

> Inferido a partir do código. Não há requisitos de performance/escalabilidade explícitos documentados para esta unit (sem timeout, sem paralelismo — extração e aplicação são sequenciais, rotina por rotina).

## Critérios de Aceitação

```gherkin
Dado um banco de origem com uma procedure "sp_exemplo" contendo DEFINER e SET OPTION
Quando o operador seleciona "sp_exemplo" para migração e confirma a aplicação
Então a procedure é criada no destino sem DEFINER original (ou com new_definer, se configurado)
  E sem a cláusula SET OPTION (substituída por SET)
  E o resultado é registrado com applied=true

Dado uma rotina cujo DDL não pôde ser extraído (extract_error preenchido)
Quando o operador tenta migrar essa rotina
Então ela é marcada skipped=true, com apply_error explicando "DDL indisponível"
  E as demais rotinas selecionadas continuam sendo processadas normalmente
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|----------------|
| Extração + remoção de DEFINER + aplicação (RF-01, RF-03) | Must | Caminho crítico — sem isso não há migração |
| Pipeline de transformações de compatibilidade (RF-04) | Must | Regra de negócio central — é o propósito da ferramenta |
| Seleção parcial de rotinas (RF-02) | Should | Importante para migrações incrementais, mas "migrar tudo" é o fallback funcional |
| Preview de compatibilidade (RF-06) | Should | Melhora a experiência do operador, mas a aplicação funciona sem preview prévio |
| `drop_existing` configurável (RF-05) | Could | Tem alternativa (deixar aplicação falhar por rotina já existente) |

> Prioridade inferida por posição na cadeia de dependências e centralidade no propósito da ferramenta (ver CLAUDE.md, "Project Overview").

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `migrate_routines.py:345` | `fetch_routines` | 🟢 |
| `migrate_routines.py:425` | `Issue` | 🟢 |
| `migrate_routines.py:434-528` | `remove_definer` + 7 funções `fix_*`/`clean_sql_mode` | 🟢 |
| `migrate_routines.py:543` | `TRANSFORMATIONS` | 🟢 |
| `migrate_routines.py:555` | `transform_routine` | 🟢 |
| `migrate_routines.py:717` | `drop_if_exists` | 🟢 |
| `migrate_routines.py:728` | `apply_routine` | 🟢 |
| `migrate_routines.py:1544-1685` | orquestração em `main()` | 🟢 |
