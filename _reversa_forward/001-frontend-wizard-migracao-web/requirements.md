# Requirements: Frontend Wizard da Migração Web

> Identificador: `001-frontend-wizard-migracao-web`
> Data: `2026-09-16`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Entrega a interface web (frontend) que falta na versão Node.js/TypeScript de `migra_db_mysql`: um wizard multi-step, consumido pelo operador via navegador, para configurar e disparar migrações de rotinas e tabelas MySQL 5.x → 8.x contra a API REST já implementada em `src/` (perfis de conexão, preview/dry-run e jobs de `routines`/`tables`). Resolve a lacuna registrada em `target_screens.md`: a versão web não tem UI própria porque o legado (`migrate_routines.py`) era CLI interativo puro — este wizard é interface nova, sem tela legada para traduzir, desenhada a partir de `target_business_rules.md` (BR-HUMANA-001).

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/migration/target_business_rules.md#BR-HUMANA-001` | Decisão RESOLVIDA: wizard multi-step com endpoint de dry-run/preview entre etapas, job final não-interativo — não formulário único. | 🟢 |
| `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-005` | Preview de compatibilidade (contagem de erros/avisos) antes de aplicar, para o operador decidir com informação — na web vira endpoint de dry-run síncrono. | 🟢 |
| `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-012` | Seleção de rotinas/tabelas sempre por nomes exatos, nunca por índice — na web vira seletor multi-select, nome não encontrado é aviso, não erro. | 🟡 |
| `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-015` | Senha nunca impressa em texto claro, ainda mais crítico numa aplicação web (logs de servidor, telas compartilhadas). | 🟢 |
| `_reversa_sdd/migration/target_architecture.md#Componentes` | "API / Wizard" descrito como: coleta parâmetros em etapas, expõe endpoint de dry-run/preview, dispara job — já implementado no backend (`src/features/*/routes.ts`), falta o cliente web. | 🟢 |
| `_reversa_sdd/migration/target_screens.md` | Nenhuma tela legada equivalente — Screen Translator rodou em modo `skipped`; wizard é interface nova sem tradução literal a seguir. | 🟢 |
| `src/features/routines/routes.ts`, `src/features/tables/routes.ts`, `src/core/profileRoutes.ts` | Contrato REST já implementado e único ponto de integração desta feature: `/connection-profiles` (CRUD), `/routines/preview`, `/routines/jobs`, `/routines/jobs/:id`, `/tables/preview`, `/tables/jobs`, `/tables/jobs/:id`. | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador de migração (DBA/dev interno, via VPN) | Migrar rotinas e/ou tabelas de um banco 5.x para um 8.x sem usar a CLI Python | Abre o wizard, seleciona perfis de conexão, escolhe itens, revisa o preview de compatibilidade, confirma, acompanha o job até a conclusão e revisa os itens que falharam |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** O wizard nunca envia índices para o backend, apenas nomes exatos de rotinas/tabelas selecionados pelo operador (`select: "all" | string[]`), espelhando o contrato já existente nas rotas. 🟢
   - Origem no legado: `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-012`
   - Tipo: alterada (de terminal para seletor multi-select em UI)
2. **RN-02:** O preview (dry-run) é uma etapa obrigatória antes de habilitar o botão de confirmação final do job — o operador não pode disparar um job sem antes ver o resultado do preview correspondente à mesma seleção de itens e opções. 🟢
   - Origem no legado: `_reversa_sdd/migration/target_business_rules.md#BR-HUMANA-001`, `#BR-MIGRAR-005`
   - Tipo: nova (decisão de produto para a versão web)
3. **RN-03:** O campo de senha de um perfil de conexão é sempre write-only na UI — nunca é reexibido, nem em texto mascarado reversível, após o perfil ser salvo. 🟢
   - Origem no legado: `_reversa_sdd/migration/target_business_rules.md#BR-MIGRAR-015`
   - Tipo: nova (a CLI nunca persistia credenciais; a web introduz o cofre, `credentialVault.ts`, cujo contrato de API já nunca retorna senha)

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Tela de gerenciamento de perfis de conexão: listar, criar e excluir, consumindo `GET/POST/DELETE /connection-profiles` | Must | Criar um perfil com host/porta/usuário/senha/database o faz aparecer na listagem sem exibir a senha; excluir um perfil referenciado por um job existente retorna erro tratado na UI (o backend recusa via `FOREIGN KEY ... ON DELETE RESTRICT`) | 🟢 |
| RF-02 | Wizard Etapa 1: escolha da feature (`routines` ou `tables`) e dos perfis de conexão origem/destino a partir dos perfis cadastrados | Must | Avançar para a Etapa 2 só é possível com feature e ambos os perfis (origem obrigatório para rotinas/tabelas; destino sempre obrigatório) selecionados | 🟢 |
| RF-03 | Wizard Etapa 2: seleção multi-select dos itens (rotinas ou tabelas) por nome exato, com opção "selecionar todos" (`select: "all"`) | Must | Nome digitado/selecionado que não existir no schema de origem é sinalizado como aviso na etapa de preview, não bloqueia o avanço (RN-01) | 🟡 |
| RF-04 | Wizard Etapa 3: formulário de opções específicas da feature — rotinas: `newDefiner`, `dropExisting`; tabelas: `copyData`, `skipCreate`, `forceInnodb`, `filters` (WHERE por tabela), `columnDefaults` (valor por tabela/coluna), `restoreRemovedFks` | Must | Cada campo tem o mesmo default documentado em `target_business_rules.md`/`service.ts` (ex.: `dropExisting` default `true` em rotinas); payload final bate exatamente com `RoutinesJobParams`/`TablesJobParams` | 🟢 |
| RF-05 | Wizard Etapa 4: preview/dry-run chamando `POST /routines/preview` ou `POST /tables/preview` com a seleção e opções atuais, exibindo por item as `Issue`s (severidade `error`/`warning`/`info`) antes da confirmação | Must | Alterar qualquer opção nas etapas anteriores invalida o preview já exibido, exigindo nova chamada de preview antes de habilitar "Confirmar" (RN-02) | 🟢 |
| RF-06 | Ao confirmar, disparar `POST /routines/jobs` ou `POST /tables/jobs`, capturar o `id` do job (HTTP 202) e navegar para a tela de acompanhamento | Must | Job criado aparece imediatamente com status `pending`/`running`, sem o usuário precisar recarregar a página manualmente | 🟢 |
| RF-07 | Tela de acompanhamento: poll periódico de `GET /{routines\|tables}/jobs/:id` até status terminal (`completed`, `failed` ou `cancelled`), exibindo os `job_items` já persistidos incrementalmente (mesmo com o job ainda `running`) | Should | Fechar e reabrir a aba durante um job em execução, usando a mesma URL com o `jobId`, retoma o acompanhamento do ponto atual sem duplicar a chamada de criação do job | 🟢 |
| RF-08 | Tela de resultado final: lista de itens processados (nome, tipo, `applied`, `skipped`, `rowsCopied` quando aplicável, `Issue`s agrupadas por severidade) | Must | Itens com `applyError` não nulo aparecem destacados como falha isolada, sem indicar que o job inteiro falhou (BR-MIGRAR-003) | 🟢 |
| RF-09 | Formulário de perfil de conexão: campo de senha sempre write-only, nunca populado ao editar um perfil existente | Must | Reabrir um perfil para edição mostra os demais campos preenchidos e o campo de senha vazio, exigindo nova digitação para alterá-la (RN-03) | 🟢 |
| RF-10 | Tela de resultado oferece acesso ao relatório completo da execução (dados estruturados, versão navegável para humano, e SQL de migração/retry), consumindo um novo endpoint de geração/consulta de relatório a ser criado no backend para servir o conteúdo já modelado em `job_reports` (tabela existente em `001_init.sql`, sem rota implementada até esta entrega) | Must | Ao concluir um job, a tela de resultado exibe/permite baixar o relatório nos 3 formatos funcionais de BR-MIGRAR-016 (estruturado, humano, SQL de auditoria/replay); enquanto o relatório não tiver sido gerado, o endpoint retorna 404 tratado na UI sem quebrar a tela | 🟡 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Segurança | Senha em texto claro nunca aparece em nenhuma tela, log de console do navegador, ou é retida em estado do cliente além do tempo de preenchimento do formulário ativo | `target_business_rules.md#BR-MIGRAR-015`; API já garante isso no backend (`credentialVault.ts` nunca retorna `password`) | 🟢 |
| Usabilidade | O wizard preserva o preenchimento das etapas já concluídas ao navegar para etapas anteriores dentro da mesma sessão de navegador (sem exigir recomeçar do zero) | `target_business_rules.md#BR-HUMANA-001` — o objetivo do wizard multi-step é permitir ajuste antes da confirmação final | 🟡 |
| Compatibilidade | Interface alvo: navegadores modernos (Chrome/Edge atualizados), sem requisito de suporte a navegadores legados | `target_architecture.md#Visão geral` — "uso interno via VPN", sem menção a requisito de compatibilidade ampla | 🟡 |
| Resiliência | Falha temporária de rede durante o polling de status do job não descarta o `jobId` nem exige reiniciar o wizard — a tela deve retentar o polling automaticamente | Alinhado a `target_business_rules.md#BR-MIGRAR-017` (falha de infraestrutura não deve invalidar trabalho já em andamento) | 🟡 |
| Segurança | Esta entrega não inclui tela de login nem sessão de usuário — o controle de acesso à aplicação é apenas o perímetro de rede (VPN, uso interno), decisão confirmada em sessão de `/reversa-clarify` | `target_architecture.md#Visão geral` ("uso interno via VPN"); decisão do operador, ver `## Esclarecimentos` | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Operador migra um conjunto de rotinas com sucesso
  Dado que existem dois perfis de conexão cadastrados (origem e destino)
  E o operador está na Etapa 1 do wizard com a feature "rotinas" selecionada
  Quando ele seleciona 3 rotinas por nome na Etapa 2
  E confirma as opções padrão na Etapa 3 (dropExisting habilitado)
  E solicita o preview na Etapa 4, recebendo 0 issues de severidade "error"
  E confirma o disparo do job
  Então o backend responde 202 com um jobId
  E a tela de acompanhamento mostra o job progredindo até o status "completed"
  E a tela de resultado lista as 3 rotinas com "applied: true"

Cenário: Operador seleciona um nome de rotina que não existe mais na origem
  Dado que o operador digitou um nome de rotina inexistente na Etapa 2
  Quando ele solicita o preview na Etapa 4
  Então a rotina inexistente aparece destacada como aviso (não erro bloqueante)
  E o operador ainda pode prosseguir e confirmar o job apenas com os itens válidos
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01, RF-02, RF-03, RF-04, RF-05, RF-06, RF-08, RF-09, RF-10 | Must | Sem esses passos o wizard não cobre o fluxo mínimo descrito em BR-HUMANA-001 (perfis → seleção → opções → preview → confirmação → resultado → relatório), este último confirmado como Must em sessão de clarify |
| RF-07 | Should | Acompanhamento incremental melhora a experiência, mas o fluxo mínimo funciona mesmo com poll simples sem retomada refinada |
| RNF de resiliência (poll com retentativa) | Should | Mitiga risco de rede instável sem ser bloqueante para a primeira entrega |

## 9. Esclarecimentos

### Sessão 2026-09-16

- **Q:** Escopo — o backend hoje só expõe rotas para `routines` e `tables` (`config`, `reports` e `collation_fix` aparecem no enum de `migration_jobs.feature`, mas sem rota implementada). Esta entrega do wizard deve cobrir apenas rotinas e tabelas, ou incluir ao menos um placeholder "em breve" para as 5 features do domínio completo?
  **R:** Cobrir só routines+tables nesta entrega. Sem placeholder para config/reports/collation-fix — ficam fora da navegação por ora.
- **Q:** Segurança — não há autenticação/sessão implementada em `src/app.ts`. O wizard deve assumir que o perímetro de rede (VPN) é controle de acesso suficiente, sem tela de login, ou autenticação é bloqueante nesta entrega?
  **R:** Assumir o perímetro VPN como controle de acesso suficiente. Sem tela de login nesta entrega (ver NFR de Segurança adicionada na seção 6).
- **Q:** Técnico — não existe rota que exponha o relatório final (`job_reports` existe no schema, sem endpoint). A tela de resultado deve se limitar ao que `GET /{feature}/jobs/:id` já retorna, ou deve ser criado um endpoint de relatório?
  **R:** Criar endpoint de relatório. A tela de resultado deve oferecer o relatório completo (BR-MIGRAR-016), não só os itens do job — ver RF-10, adicionado como Must.

## 10. Lacunas

Nenhuma lacuna pendente. As 3 dúvidas abertas na versão inicial deste documento foram resolvidas na sessão de esclarecimentos de 2026-09-16 (ver seção 9).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-16 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-09-16 | Sessão de esclarecimentos: 3 dúvidas resolvidas (escopo, segurança, relatório); adicionado RF-10 e NFR de Segurança | reversa |
