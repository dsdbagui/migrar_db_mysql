# Regression Watch: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|--------------------------|------------------------------|----------------------|---------------------|
| W001 | `discard_log.md#BR-DESCARTAR-001` | Nenhum ponto do backend/frontend web pausa a execução de um job para perguntar algo ao operador em tempo real — toda decisão é coletada no formulário/wizard antes do job iniciar | ausência | Código novo introduzindo um prompt bloqueante (ex.: aguardar resposta HTTP no meio da execução de `runJob`) em vez de validar tudo antecipadamente |
| W002 | `discard_log.md#BR-DESCARTAR-002` | A criação do banco de destino ausente (erro 1049) é decidida por um campo booleano pré-declarado antes do job, nunca perguntada reativamente no meio da conexão | ausência | Reintrodução de lógica que trata o erro 1049 perguntando algo ao operador em vez de falhar com mensagem clara quando a opção não foi marcada |
| W003 | `discard_log.md#BR-DESCARTAR-005` | Nenhuma tela da aplicação web renderiza uma "tabela de terminal" (`rich.Table` ou equivalente) — o resumo de rotinas/tabelas é sempre HTML/DOM | ausência | Reaparecimento de lógica de formatação de texto tabular pensada para largura de terminal dentro do frontend ou do backend |

## Observações

<!-- Regras originalmente 🟡 ou 🔴 — sem peso de regressão, mas relevantes para a próxima re-extração. -->

- **BR-MIGRAR-016** (`target_business_rules.md`, confiança original 🟡 + decisão de revisão): o mecanismo de geração do relatório mudou de "3 funções de renderização independentes, síncronas, em disco" para "1 serializador único (`src/features/reports/serializer.ts`), sob demanda, persistido em `job_reports`, servido via HTTP". Vale conferir, numa futura re-extração sobre o código novo, se essa consolidação realmente se manteve (nenhuma lógica de formatação duplicada entre os 4 formatos) antes de promover isso a um watch item com peso de regressão.
- **RF-09 / edição de perfil** (gap descoberto durante `/reversa-coding`, ver `actions.md` § Notas de execução): o backend não tem endpoint de atualização de perfil de conexão nesta entrega. Se um endpoint `PATCH`/`PUT /connection-profiles/:id` for adicionado numa entrega futura, revisitar se o formulário de edição reexibe a senha (violaria BR-MIGRAR-015) — watch item deve ser criado nessa ocasião, não antes.

## Histórico de re-extrações

<!-- Preenchido pelo agente reverso (`/reversa`) na próxima vez que rodar sobre este código. -->

## Arquivadas

<!-- Watch items encerrados por não se aplicarem mais. -->
