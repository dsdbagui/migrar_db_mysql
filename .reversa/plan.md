# Plano de Exploração — migrar_db_mysql

> Criado pelo Reversa em 2026-09-15
> Marque cada tarefa com ✅ quando concluída.
> Você pode editar este plano antes de iniciar: adicione, remova ou reordene tarefas conforme necessário.

---

## Fase 1: Reconhecimento 🔍

- [x] **Scout** — Mapeamento de estrutura de pastas e tecnologias (`inventory.md`)
- [x] **Scout** — Análise de dependências e gerenciadores de pacotes (`dependencies.md`)
- [x] **Scout** — Identificação de entry points, CI/CD e configurações
- ⚠️ `.reversa/context/surface.json` (artefato de apoio do Scout, referenciado por `code-analysis.md`) está ausente — perdido numa reinstalação/reset do framework em 2026-09-15. Não bloqueia as fases seguintes, mas seria bom reconstituir num próximo Scout.

## Decisão de organização das specs 🗂️

> Entre o Scout e o Arqueólogo, o Reversa pergunta como você quer organizar as specs (por módulo, caso de uso, endpoint, híbrida, por features ou customizada). A escolha fica persistida em `.reversa/config.toml` na seção `[specs]` e não será reperguntada em execuções futuras. Para reapresentar o menu, remova manualmente a seção.
>
> ✅ **Decidido em 2026-09-15** — `granularity = "feature"` (`layout = "feature-folder"`), consistente com a organização já usada em `code-analysis.md` e nos flowcharts. Persistido em `.reversa/config.toml`.

## Fase 2: Escavação 🏗️

Projeto sem módulos de domínio tradicionais — organizado por **feature** (ver `code-analysis.md`):

- [x] **Arqueólogo** — `migracao-de-rotinas`
- [x] **Arqueólogo** — `migracao-de-tabelas`
- [x] **Arqueólogo** — `arquivo-de-configuracao`
- [x] **Arqueólogo** — `relatorios-de-migracao`
- [x] **Arqueólogo** — `correcao-de-collation`

## Fase 3: Interpretação 🧠

- [x] **Detetive** — Arqueologia Git e ADRs retroativos (`adrs/0001`–`0005`; `0006`/`0007` adicionados em 2026-09-15 refletindo o commit `971bdf5`)
- [x] **Detetive** — Regras de negócio implícitas e máquinas de estado (`domain.md`, `state-machines.md`)
- [x] **Detetive** — Matriz de permissões (RBAC/ACL) (`permissions.md`)
- [x] **Arquiteto** — Diagramas C4 (Contexto, Containers, Componentes)
- [x] **Arquiteto** — ERD completo e integrações externas
- [x] **Arquiteto** — Spec Impact Matrix

## Fase 4: Geração 📝

- [x] **Redator** — Specs SDD por componente — `migracao-de-rotinas/` (requirements, design, tasks, decisions)
- [x] **Redator** — Specs SDD por componente — `migracao-de-tabelas/`
- [x] **Redator** — Specs SDD por componente — `arquivo-de-configuracao/`
- [x] **Redator** — Specs SDD por componente — `relatorios-de-migracao/`
- [x] **Redator** — Specs SDD por componente — `correcao-de-collation/`
- [x] **Redator** — OpenAPI — n/a, projeto não expõe API
- [x] **Redator** — User Stories (3 arquivos: `migrar-schema-e-dados.md`, `revisar-e-reprocessar-relatorio.md`, `corrigir-collation-pos-migracao.md`)
- [x] **Redator** — Code/Spec Matrix (`traceability/code-spec-matrix.md`)

## Fase 5: Revisão ✅

- [x] **Revisor** — Revisão cruzada de specs
- [x] **Revisor** — Resolução de lacunas com o usuário
- [x] **Revisor** — Relatório de confiança final

---

## Agentes Independentes

> Execute estes agentes quando os recursos estiverem disponíveis — podem rodar em qualquer fase.

- [ ] **Visor** — Análise de interface via screenshots
- [ ] **Data Master** — Análise completa do banco de dados
- [ ] **Design System** — Extração de tokens de design
- [ ] **Tracer** — Análise dinâmica (requer sistema acessível)

---

## Próximo passo

Após o Time de Descoberta concluir e o `_reversa_sdd/` estar populado, você pode disparar um dos fluxos seguintes:

- `/reversa-migrate`: orquestrador do **Time de Migração** (Paradigm Advisor → Curator → Strategist → Designer → Screen Translator → Inspector). Gera as specs do sistema novo. Saída em `_reversa_sdd/migration/` e `_reversa_sdd/screens/`.
- `/reversa-reconstructor`: gera plano bottom-up para reimplementar o software a partir das specs do legado (uma tarefa por sessão).
