---
schemaVersion: 1
generatedAt: 2026-09-15T19:40:00Z
reversa:
  version: "1.3.3"
kind: target_business_rules
producedBy: curator
hash: "sha256:8bd9b5bc02da47602cbab4ce358bc87ed5fb8a87d6c719a0a1a04cb001c32580"
---

# Target Business Rules

> Catálogo das regras de negócio do legado com decisão de migração: MIGRAR, DESCARTAR ou DECISÃO HUMANA.
> Cada item rastreia para a origem em `_reversa_sdd/` e respeita `paradigm_decision.md` (paradigma legado: procedural 🟢; escolha: híbrido/balanced — pipeline interno permanece sequencial, exposto via job assíncrono simples, sem arquitetura de eventos plena).

## Resumo
- Total de regras analisadas: 26
- MIGRAR: 20
- DESCARTAR: 5 (5 vinculadas a paradigma — detalhe em `discard_log.md`)
- DECISÃO HUMANA: 3 (todas resolvidas pelo operador em 2026-09-15 — nenhuma referente a ambiguidade herdada do legado, todas eram decisões de produto novas da versão web)

## Regras MIGRAR

### BR-MIGRAR-001
- **Origem**: `_reversa_sdd/migracao-de-rotinas/requirements.md` § Regras de Negócio
- **Confiança original**: 🟡
- **Descrição**: `DEFINER` original é sempre removido por padrão; se `new_definer` não for informado, o MySQL assume o usuário da conexão de destino como definer implícito de todas as rotinas migradas.
- **Justificativa de migração**: regra de portabilidade entre servidores — o definer original provavelmente não existe no destino. Não depende de paradigma, é lógica de domínio pura.
- **Compatibilidade com paradigma alvo**: nenhuma mudança — continua sendo uma transformação de string aplicada antes do `CREATE`, dentro do pipeline sequencial preservado pela decisão híbrida.

### BR-MIGRAR-002
- **Origem**: `_reversa_sdd/migracao-de-rotinas/requirements.md` § RF-04; `code-analysis.md`
- **Confiança original**: 🟢
- **Descrição**: 8 transformações de compatibilidade DDL de rotina (`fix_set_option`, `fix_old_password_hash`, `clean_sql_mode`, `fix_no_zero_date`, `fix_group_concat_maxlen`, `fix_sql_security`, `fix_no_default_charset`, `fix_only_full_group_by`), aplicadas em ordem fixa, cada uma com severidade própria (`error`/`warning`/`info`).
- **Justificativa de migração**: é o propósito central da ferramenta — regra de negócio pura, função `(ddl) -> (ddl, Issue)`.
- **Compatibilidade com paradigma alvo**: nenhuma — funções puras se portam 1:1 para TypeScript sem precisar virar handlers de evento (paradigma_decision.md, implicação para Curator).

### BR-MIGRAR-003
- **Origem**: `_reversa_sdd/migracao-de-rotinas/requirements.md` § Requisitos Não Funcionais
- **Confiança original**: 🟢
- **Descrição**: falha isolada na extração ou aplicação de uma rotina não aborta o lote inteiro — é capturada e registrada por item.
- **Justificativa de migração**: requisito central de robustez, independente de tecnologia.
- **Compatibilidade com paradigma alvo**: no job em background (execução ainda sequencial internamente), a falha de um item continua apenas marcando aquele item como erro e seguindo para o próximo — sem precisar de DLQ/retry de fila real (decisão híbrida).

### BR-MIGRAR-004
- **Origem**: `_reversa_sdd/migracao-de-rotinas/requirements.md` § RF-05
- **Confiança original**: 🟢
- **Descrição**: `drop_existing` (DROP IF EXISTS antes de CREATE) configurável pelo operador.
- **Justificativa de migração**: opção de negócio válida, sem relação com paradigma.
- **Compatibilidade com paradigma alvo**: vira um campo booleano no formulário/payload da API, sem mudança de comportamento.

### BR-MIGRAR-005
- **Origem**: `_reversa_sdd/migracao-de-rotinas/requirements.md` § RF-06
- **Confiança original**: 🟢
- **Descrição**: preview de compatibilidade (contagem de erros/avisos) antes de aplicar, para o operador decidir com informação.
- **Justificativa de migração**: reduz risco de aplicar migração com muitos problemas sem o operador saber antecipadamente.
- **Compatibilidade com paradigma alvo**: na web vira um endpoint de "dry-run" síncrono (roda as transformações sem aplicar no banco), retornando o preview antes do usuário confirmar o job assíncrono — ver BR-HUMANA-001.

### BR-MIGRAR-006
- **Origem**: `_reversa_sdd/migracao-de-tabelas/decisions.md` (ADR-0002); `domain.md` § "Sobre a estratégia de recuperação de FK"
- **Confiança original**: 🟡
- **Descrição**: prioridade de negócio "dados e estrutura primeiro, integridade referencial estrita depois, best-effort" — uma migração pode terminar `applied=True` numa tabela sem todas as FKs originais restauradas.
- **Justificativa de migração**: é o núcleo de negócio mais elaborado do projeto; central ao propósito da ferramenta.
- **Compatibilidade com paradigma alvo**: nenhuma mudança de fundo — a ordem "todas as tabelas → resolver FKs pendentes" precisa ser rastreada como estado explícito do job (paradigm_decision.md, implicação 2), mas a regra de negócio em si (priorizar completar sobre integridade imediata) sobrevive.

### BR-MIGRAR-007
- **Origem**: `_reversa_sdd/migracao-de-tabelas/domain.md` § "Sobre TINYINT(1) e display width"
- **Confiança original**: 🟢
- **Descrição**: `TINYINT(1)` é deliberadamente preservado ao remover display width de outros inteiros (convenção de boolean em ORMs).
- **Justificativa de migração**: regra de compatibilidade semântica confirmada explicitamente no código-fonte original.
- **Compatibilidade com paradigma alvo**: nenhuma — transformação de string, sem relação com paradigma.

### BR-MIGRAR-008
- **Origem**: `_reversa_sdd/migracao-de-tabelas/decisions.md` (ADR-0006)
- **Confiança original**: 🟢
- **Descrição**: `column_defaults` aplica valor de fallback em dois lugares simultâneos — `ALTER TABLE ... SET DEFAULT` no schema E substituição de `NULL` em memória por linha — porque um `DEFAULT` sozinho não evita erro de `NOT NULL` quando o `INSERT` envia `NULL` explícito.
- **Justificativa de migração**: regra técnica-de-negócio crítica; aplicar só uma das duas partes reintroduz o bug que o commit `971bdf5` corrigiu.
- **Compatibilidade com paradigma alvo**: nenhuma mudança — ambos os efeitos continuam necessários independente do paradigma de execução.

### BR-MIGRAR-009
- **Origem**: `_reversa_sdd/migracao-de-tabelas/requirements.md` § RF-04
- **Confiança original**: 🟢
- **Descrição**: `skip_create=true` pula inteiramente `DROP`/`CREATE`, mas o `ALTER TABLE ... SET DEFAULT` de `column_defaults` ainda roda, mesmo em tabela pré-existente.
- **Justificativa de migração**: cenário de negócio válido (schema pré-criado por outro processo).
- **Compatibilidade com paradigma alvo**: nenhuma.

### BR-MIGRAR-010
- **Origem**: `_reversa_sdd/migracao-de-tabelas/requirements.md` § RF-08; `questions.md#pergunta-4`
- **Confiança original**: 🟢 (regra original) + decisão confirmada em revisão
- **Descrição**: FK removida por recuperação só é restaurada se, no momento pós-carga, a coluna referenciada não tiver duplicatas; caso contrário fica `FK_NOT_RESTORED` permanentemente, sem retry automático — confirmado como aceitável (processo manual) na revisão de specs.
- **Justificativa de migração**: regra de negócio validada duas vezes (código + operador).
- **Compatibilidade com paradigma alvo**: nenhuma — não vira uma tarefa de fila com retry automático, por decisão explícita do operador.

### BR-MIGRAR-011 🆕
- **Origem**: `_reversa_sdd/migracao-de-tabelas/requirements.md` § RF-10 (novo); `questions.md#pergunta-5`
- **Confiança original**: requisito novo, não existe no legado
- **Descrição**: falha isolada de `ALTER TABLE ... SET DEFAULT` numa coluna deve gerar uma `Issue` de severidade `warning` (`COLUMN_DEFAULT_FAILED`) visível no relatório final — divergência deliberada do legado (que só loga em terminal).
- **Justificativa de migração**: decisão do operador durante a revisão de specs — corrige uma lacuna de observabilidade real do legado.
- **Compatibilidade com paradigma alvo**: nenhuma — é sobre estrutura de dados de resultado, não sobre execução.

### BR-MIGRAR-012
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/decisions.md` (ADR-0003)
- **Confiança original**: 🟡
- **Descrição**: seleção de rotinas/tabelas por nomes exatos, nunca por índices — decisão deliberada porque índices mudam entre execuções conforme o schema evolui.
- **Justificativa de migração**: regra de robustez que sobrevive a qualquer interface (CLI ou web).
- **Compatibilidade com paradigma alvo**: na web vira uma lista de nomes vinda de um seletor multi-select na UI, com a mesma validação de "nome não encontrado = aviso, não erro".

### BR-MIGRAR-013
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/design.md` § Riscos e Lacunas; `questions.md#pergunta-6`
- **Confiança original**: 🟡 (regra original) + decisão confirmada em revisão
- **Descrição**: ausência de validação formal de schema de configuração é um comportamento a preservar deliberadamente — mas deve ser documentado explicitamente para o operador (decisão do operador: manter simplicidade, mas avisar).
- **Justificativa de migração**: decisão de produto confirmada pelo operador durante a revisão.
- **Compatibilidade com paradigma alvo**: **atenção** — o *mecanismo* de "avisar sobre chaves desconhecidas" muda de natureza na web (não há mais um `--init-config` gerando arquivo comentado — ver BR-DESCARTAR-003). A regra de negócio ("não validar rigidamente, mas ser transparente sobre isso") sobrevive; a implementação muda para texto de ajuda/tooltip na UI do formulário.

### BR-MIGRAR-014
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/decisions.md` (ADR-0007)
- **Confiança original**: 🟢
- **Descrição**: porta padrão sugerida para o destino é `3306`; o campo `database` do destino sugere o mesmo nome do banco de origem como default.
- **Justificativa de migração**: default de UX que reduz erro de digitação/confusão.
- **Compatibilidade com paradigma alvo**: nenhuma — vira valor pré-preenchido no formulário web em vez de no prompt de terminal.

### BR-MIGRAR-015
- **Origem**: `_reversa_sdd/arquivo-de-configuracao/requirements.md` § Requisitos Não Funcionais
- **Confiança original**: 🟢
- **Descrição**: senha nunca é impressa em texto claro, mesmo quando resolvida via configuração.
- **Justificativa de migração**: requisito de segurança inegociável, ainda mais crítico numa aplicação web (logs de servidor, telas compartilhadas).
- **Compatibilidade com paradigma alvo**: reforça a necessidade de BR-HUMANA-002 (armazenamento de credenciais na versão web).

### BR-MIGRAR-016
- **Origem**: `_reversa_sdd/relatorios-de-migracao/domain.md` § "Sobre relatório em 3 formatos"; `questions.md#pergunta-8`
- **Confiança original**: 🟡 (regra original) + decisão de revisão
- **Descrição**: o relatório continua sendo necessário em três formatos funcionais — dados estruturados para automação, visualização humana, e SQL para auditoria/replay — mas a *implementação* deve ser consolidada sob um serializador único na reimplementação (decisão de revisão), em vez de três funções de renderização independentes.
- **Justificativa de migração**: a necessidade de negócio (três públicos consumidores) continua; só a arquitetura interna muda.
- **Compatibilidade com paradigma alvo**: nenhuma relação com o gap de paradigma — é uma melhoria de manutenibilidade decidida independentemente.

### BR-MIGRAR-017
- **Origem**: `_reversa_sdd/relatorios-de-migracao/decisions.md` (ADR-0004, Adendo)
- **Confiança original**: 🟢
- **Descrição**: falha ao salvar o relatório em disco nunca desfaz ou afeta a migração já aplicada ao banco — é puramente um problema de auditoria, tratado com fallback em cascata (diretório atual → temp do SO → desistir sem crash).
- **Justificativa de migração**: regra de resiliência crítica — a migração dos dados é mais importante que o artefato de relatório.
- **Compatibilidade com paradigma alvo**: no job assíncrono, a falha ao persistir o relatório deve, pelo mesmo motivo, nunca marcar o job inteiro como falho — só sinalizar que o relatório está indisponível.

### BR-MIGRAR-018
- **Origem**: `_reversa_sdd/relatorios-de-migracao/design.md` § Fluxo Principal
- **Confiança original**: 🟢
- **Descrição**: `retry_tables.sql` inclui `DROP TABLE IF EXISTS` antes de cada `CREATE` (idempotência de retry); `retry_routines.sql` não precisa, pois rotinas já usam `DROP ... IF EXISTS` opcional no fluxo normal.
- **Justificativa de migração**: nuance de negócio sutil mas correta — preservar exatamente.
- **Compatibilidade com paradigma alvo**: nenhuma.

### BR-MIGRAR-019
- **Origem**: `_reversa_sdd/correcao-de-collation/domain.md` § "Sobre o carimbo de collation"
- **Confiança original**: 🟢
- **Descrição**: `DATABASE_COLLATION` é um metadado carimbado no momento da criação da rotina, não atualizado automaticamente quando o collation do banco muda depois — só um novo `CREATE` re-carimba.
- **Justificativa de migração**: é um fato de negócio sobre o próprio MySQL, não uma escolha de implementação — a ferramenta existe para lidar com essa realidade.
- **Compatibilidade com paradigma alvo**: nenhuma.

### BR-MIGRAR-020
- **Origem**: `_reversa_sdd/correcao-de-collation/requirements.md` § RF-02
- **Confiança original**: 🟢
- **Descrição**: guarda de segurança — recusa executar a correção de collation se o banco ainda estiver com o collation antigo (pressupõe conversão prévia e separada do schema).
- **Justificativa de migração**: proteção central que evita rodar a ferramenta fora de ordem; crítica de preservar.
- **Compatibilidade com paradigma alvo**: nenhuma — validação de pré-condição, independente de like a execução ser síncrona ou em job.

### BR-MIGRAR-021 🆕
- **Origem**: `_reversa_sdd/correcao-de-collation/requirements.md` § RF-09 (novo); `questions.md#pergunta-10`
- **Confiança original**: requisito novo, não existe no legado
- **Descrição**: salvaguarda obrigatória (Must) contra perda de rotina quando `DROP` é commitado mas `CREATE` subsequente falha — via transação atômica ou backup do DDL original com restauração automática.
- **Justificativa de migração**: decisão explícita do operador durante a revisão — o risco de perda permanente de uma rotina de produção foi julgado inaceitável.
- **Compatibilidade com paradigma alvo**: nenhuma — é uma correção de robustez transacional, ortogonal ao paradigma de execução.

### BR-MIGRAR-022
- **Origem**: `_reversa_sdd/domain.md` § Lacunas identificadas; `questions.md#pergunta-11`
- **Confiança original**: 🟢 (confirmado em revisão)
- **Descrição**: severidade fixa por tipo de padrão de `Issue` (ex: `GROUP_CONCAT` sem limite = `warning`, sem inspecionar `group_concat_max_len` real do servidor de destino) é comportamento intencional, confirmado pelo operador.
- **Justificativa de migração**: evita sobre-engenharia (consultar o servidor de destino antes de decidir severidade) para um ganho marginal.
- **Compatibilidade com paradigma alvo**: nenhuma — mantém as funções de transformação como puras, sem I/O, o que inclusive facilita a portabilidade (implicação 1 de `paradigm_decision.md`).

### BR-MIGRAR-023
- **Origem**: `_reversa_sdd/correcao-de-collation/decisions.md` (ADR-0005)
- **Confiança original**: 🟡
- **Descrição**: `OLD_COLLATION` é o par fixo de collation antigo→novo tratado por execução da ferramenta de correção.
- **Justificativa de migração**: a lógica de "encontrar rotinas com collation desatualizado e recriá-las" é regra de negócio central desta feature.
- **Compatibilidade com paradigma alvo**: **atenção** — no legado o valor é hardcoded no código-fonte; ver BR-HUMANA-003 sobre se isso deve virar parametrizável na versão web.

## Regras DESCARTAR (resumo)

| ID | Origem | Motivo curto | Vínculo a paradigma? |
|---|---|---|---|
| BR-DESCARTAR-001 | `arquivo-de-configuracao/design.md` § Fluxo Principal | `cfg_ask`/`cfg_confirm` cai para prompt interativo de terminal quando a chave está ausente — não há "terminal esperando input" numa aplicação web | sim |
| BR-DESCARTAR-002 | `arquivo-de-configuracao/decisions.md` (ADR-0007) | `destination.create_database_if_missing` só é perguntado reativamente quando `connect()` recebe erro 1049 em pleno fluxo — não há como "pausar e perguntar" um job em background do mesmo jeito | sim |
| BR-DESCARTAR-003 | `arquivo-de-configuracao/requirements.md` § RF-05 | `--init-config` gera um arquivo JSON comentado como forma de documentar os campos — artefato de interação por arquivo texto, próprio de CLI | sim |
| BR-DESCARTAR-004 | `correcao-de-collation/decisions.md` (ADR-0005) | Dois mecanismos de credencial diferentes (`.env` vs `--config` JSON) entre as duas ferramentas do legado — inconsistência técnica a não replicar, não uma regra de negócio | não |
| BR-DESCARTAR-005 | `relatorios-de-migracao/design.md` § Interface | Resumo em tabela de terminal (`rich.Table`/fallback texto) — renderização de terminal não existe em aplicação web | sim |

> Detalhe completo em `discard_log.md`.

## Regras DECISÃO HUMANA

### BR-HUMANA-001
- **Origem**: consolidação de `migracao-de-rotinas/design.md` (Fluxo Principal), `migracao-de-tabelas/design.md` (Fluxo Principal) — múltiplos pontos de decisão interativa hoje feitos ao vivo no CLI (seleção de itens, `copy_data`, filtros `WHERE`, `column_defaults`, `force_innodb`, preview, confirmação final)
- **Tipo de ambiguidade**: dependência de decisão de produto (não é ambiguidade herdada do legado, é uma decisão nova da versão web)
- **Descrição**: como o fluxo de "várias perguntas em sequência com preview antes de aplicar" do CLI deve virar na interface web — tudo coletado de uma vez num formulário único antes de disparar o job (mais simples de implementar, mas menos parecido com a experiência atual), ou um wizard multi-etapas que ainda mostra preview e permite ajuste antes da confirmação final?
- **Opções**: (a) formulário único + payload completo; (b) wizard multi-step síncrono, com endpoint de "dry-run"/preview entre as etapas, mantendo o job em si como uma etapa final única e não-interativa
- **Recomendação do Curator**: opção (b) — preserva a experiência de "ver preview antes de aplicar" (BR-MIGRAR-005) sem exigir que o job em background seja interativo, alinhado à decisão híbrida de paradigma.
- **Status**: RESOLVIDA — opção (b), wizard multi-step com preview. Decisor: operador, 2026-09-15.

### BR-HUMANA-002
- **Origem**: `permissions.md` § Papel "Operador"; BR-MIGRAR-015 (senha nunca em claro)
- **Tipo de ambiguidade**: decisão de produto/segurança nova, fora do escopo das specs do legado
- **Descrição**: a versão web deve exigir que o operador digite as credenciais MySQL de origem/destino a cada migração (como o CLI faz hoje), ou deve haver um cofre de credenciais/perfis de conexão salvos, reutilizáveis entre execuções?
- **Opções**: (a) sem persistência de credencial, digitação a cada execução; (b) cofre de credenciais simples (perfis nomeados, senha cifrada em repouso)
- **Recomendação do Curator**: dado o contexto de uso interno via VPN (não exposto à internet) e o volume aparentemente baixo de execuções por operador, um cofre simples (b) melhora a experiência sem violar a regra de "senha nunca em claro" — mas é uma decisão de segurança que extrapola o que as specs do legado documentam, por isso fica para decisão humana.
- **Status**: RESOLVIDA — opção (b), cofre de credenciais com senha cifrada em repouso. Decisor: operador, 2026-09-15.

### BR-HUMANA-003
- **Origem**: `correcao-de-collation/decisions.md` (ADR-0005); BR-MIGRAR-023
- **Tipo de ambiguidade**: decisão de produto nova
- **Descrição**: `OLD_COLLATION` é hardcoded no legado (suporta um único par de collation antigo→novo por execução do script). A versão web deve manter isso fixo, ou parametrizar o par de collations via formulário, permitindo cenários além de `utf8mb4_unicode_ci` → `utf8mb4_0900_ai_ci`?
- **Opções**: (a) manter fixo (mais simples, cobre o caso de uso conhecido); (b) parametrizar (mais flexível, mas sem evidência de necessidade real hoje)
- **Recomendação do Curator**: parametrizar (b) tem custo baixo (um campo a mais no formulário) e remove uma limitação arbitrária do legado, mas só vale a pena se houver expectativa real de uso com outros pares de collation — perguntar ao operador se esse é um cenário esperado.
- **Status**: RESOLVIDA — parametrizar via formulário. Decisor: operador, 2026-09-15.

## Notas

Nenhuma regra de negócio do legado foi classificada como ⚠️ AMBÍGUA ou 🔴 LACUNA sem já ter passado pela revisão de specs (`_reversa_sdd/questions.md`) — todas as lacunas genuínas do legado já foram resolvidas ou documentadas em `gaps.md` antes desta etapa. As três `DECISÃO HUMANA` registradas aqui são, portanto, decisões de **produto novo** (como a experiência web deve se comportar), não ambiguidades herdadas — refletido em `ambiguity_log.md`.
