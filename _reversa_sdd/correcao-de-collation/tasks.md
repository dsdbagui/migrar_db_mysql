# correcao-de-collation, Tarefas de Implementação

> Sequência para reimplementar `fix_collation_stamp.py` a partir do legado, com rastreabilidade ao código original.

## Pré-requisitos

- [ ] Driver de conexão MySQL disponível (equivalente a `mysql-connector-python`)
- [ ] Biblioteca de output rica opcional, com fallback para texto simples (equivalente a `rich`)
- [ ] Mecanismo de leitura de `.env` local (ou reaproveitar o `--config` de `migracao-de-rotinas`, se a reimplementação optar por unificar — ver `decisions.md`)

## Tarefas

- [ ] T-01, Carregar credenciais de `.env` (mesma pasta do script), sem sobrescrever variáveis de ambiente do SO já definidas; se ausente, cair para prompts interativos
  - Origem no legado: `fix_collation_stamp.py:64` (`load_env`)
  - Critério de pronto: com `.env` presente contendo `DB_HOST`/`DB_USER`/`DB_PASSWORD`, nenhum prompt de conexão é exibido; sem `.env`, todos os campos são perguntados
  - Confiança: 🟢

- [ ] T-02, Conectar ao banco único (sem conceito de origem/destino), sem retry — falha encerra o processo
  - Origem no legado: `fix_collation_stamp.py:144` (`connect`), `:363-365`
  - Critério de pronto: falha de conexão produz mensagem de erro e encerramento imediato (`exit(1)`)
  - Confiança: 🟢

- [ ] T-03, Ler o collation atual do schema (`DEFAULT_COLLATION_NAME` de `information_schema.SCHEMATA`)
  - Origem no legado: `fix_collation_stamp.py:189` (`get_current_db_collation`)
  - Critério de pronto: retorna a string do collation atual do banco informado
  - Confiança: 🟢

- [ ] T-04, Guarda de segurança: recusar execução se o collation atual ainda for o antigo (`OLD_COLLATION`), com mensagem orientando a conversão prévia do schema
  - Origem no legado: `fix_collation_stamp.py:374-378`
  - Critério de pronto: com collation atual == `OLD_COLLATION`, o processo encerra antes de consultar qualquer rotina
  - Confiança: 🟢

- [ ] T-05, Localizar procedures e functions cujo `DATABASE_COLLATION` ainda é o antigo
  - Origem no legado: `fix_collation_stamp.py:165-186` (`find_stale_routines`)
  - Critério de pronto: query cobre `PROCEDURE` e `FUNCTION`, filtrando por `ROUTINE_SCHEMA` e `DATABASE_COLLATION = OLD_COLLATION`
  - Confiança: 🟢

- [ ] T-06, Se nenhuma rotina desatualizada for encontrada, encerrar com sucesso sem pedir confirmação
  - Origem no legado: `fix_collation_stamp.py:384-387`
  - Critério de pronto: lista vazia produz mensagem de "nada a fazer" e encerramento com código de sucesso
  - Confiança: 🟢

- [ ] T-07, Listar as rotinas encontradas (tipo, nome, charset client, collation atual) e exigir confirmação explícita antes de alterar qualquer uma
  - Origem no legado: `fix_collation_stamp.py:394-418`
  - Critério de pronto: recusa da confirmação encerra sem nenhuma alteração no banco
  - Confiança: 🟢

- [ ] T-08, Obter o DDL de cada rotina via `SHOW CREATE PROCEDURE/FUNCTION`, removendo o `DEFINER` via regex
  - Origem no legado: `fix_collation_stamp.py:205-227` (`get_ddl`)
  - Critério de pronto: DDL resultante não contém cláusula `DEFINER`; falha na consulta é capturada e retornada como erro, não propagada como exceção
  - Confiança: 🟢

- [ ] T-09, Recriar cada rotina via `DROP {tipo} IF EXISTS` seguido de `CREATE` do DDL sem `DEFINER`, capturando sucesso/erro individualmente sem abortar o lote — **com salvaguarda contra perda de rotina (novo requisito, decidido em revisão): usar transação atômica de `DROP`+`CREATE`, ou guardar o DDL original em memória antes do `DROP` e tentar restaurá-lo automaticamente se o `CREATE` falhar**
  - Origem no legado: `fix_collation_stamp.py:230-259` (`recreate_routine`)
  - Critério de pronto: erro em uma rotina não impede o processamento das demais; resultado (`sucesso`, `ddl`, `erro`) é registrado por rotina; **se o `CREATE` falhar após o `DROP`, a rotina original é restaurada automaticamente (ou a operação inteira é revertida via transação), nunca ficando ausente do banco**
  - Confiança: 🟢 (comportamento original) / 🆕 (salvaguarda — decisão de revisão, `../questions.md#pergunta-10`)

- [ ] T-10, Exibir resumo (total / OK / erro) ao final do processamento
  - Origem no legado: `fix_collation_stamp.py:438-450`
  - Critério de pronto: contagens batem com o número de itens em `results`
  - Confiança: 🟢

- [ ] T-11, Rodar verificação pós-execução (repetir a busca por collation antigo) e reportar rotinas remanescentes, se houver
  - Origem no legado: `fix_collation_stamp.py:452-460`
  - Critério de pronto: executada apenas se houve pelo menos uma recriação bem-sucedida (`n_ok > 0`); lista cada rotina remanescente com aviso, ou confirma que não sobrou nenhuma
  - Confiança: 🟢

- [ ] T-12, Salvar log opcional em disco: `log.json` (resumo estruturado) e `recreated.sql` (todos os DDLs recriados, comentados por status) sempre que confirmado; `retry_errors.sql` apenas quando há rotina com erro e DDL disponível
  - Origem no legado: `fix_collation_stamp.py:266-321` (`save_log`)
  - Critério de pronto: `retry_errors.sql` só existe quando `n_err > 0`; diretório nomeado `fix_collation_<database>_<timestamp>/`
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01, Teste do happy path: banco já convertido, N rotinas desatualizadas encontradas, confirmação positiva, todas recriadas com sucesso, verificação pós-execução não encontra mais nenhuma (ver `requirements.md`, Critérios de Aceitação)
- [ ] TT-02, Teste da guarda de segurança: banco ainda com collation antigo, execução deve abortar antes de qualquer consulta de rotina
- [ ] TT-03, Teste de "nada a fazer": nenhuma rotina desatualizada, encerramento com sucesso sem pedir confirmação
- [ ] TT-04, Teste de recusa de confirmação: nenhuma rotina alterada quando o operador recusa
- [ ] TT-05, Teste de falha parcial: uma rotina falha ao recriar (ex: erro de sintaxe/permissão), as demais são processadas normalmente e o resumo reflete OK + erro corretamente
- [ ] TT-06, Teste de `retry_errors.sql`: gerado apenas quando há pelo menos uma rotina com erro e DDL capturado

## Tarefas de Migração de Dados (se aplicável)

- n/a — este script não copia dados, apenas recria definições de rotinas armazenadas no mesmo banco.

## Ordem Sugerida

1. T-01 a T-04 (conexão e guardas de segurança) devem existir antes de qualquer leitura de rotina — são pré-condições que evitam rodar a ferramenta fora de ordem.
2. T-05 a T-07 (localização, listagem, confirmação) formam o "modo leitura" do fluxo — nenhuma alteração ocorre antes da confirmação explícita.
3. T-08 e T-09 são o núcleo destrutivo (DROP+CREATE) — dependem diretamente de T-05 (lista de alvos) e T-07 (confirmação).
4. T-10 e T-11 dependem do resultado de T-09 (não podem ser paralelizadas com o loop de recriação).
5. T-12 é independente das demais em termos de dados (usa `results` já pronto), mas deve ser a última etapa da execução.

## Lacunas Pendentes

Nenhuma — a única lacuna 🔴 desta unit (comportamento de `DROP` commitado + `CREATE` falho) foi resolvida em revisão (2026-09-15, `../questions.md#pergunta-10`): a reimplementação deve adicionar salvaguarda automática (ver T-09), não é mais uma decisão em aberto.
