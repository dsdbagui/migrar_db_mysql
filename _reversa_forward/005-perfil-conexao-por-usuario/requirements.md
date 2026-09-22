# Requirements: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`
> Pasta da extração reversa: `_reversa_sdd/`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Hoje a aplicação web não tem login próprio (perímetro de VPN é o único controle de acesso) e cada `connection_profile` carrega um `database_name` fixo — na prática, uma credencial de servidor MySQL precisa de um perfil novo por banco a migrar, mesmo quando host/usuário/senha são os mesmos. Esta feature adiciona autenticação de aplicação (usuário/senha próprios, não os do MySQL), associa cada perfil de conexão ao usuário que o criou, e move a escolha do banco de origem/destino do cadastro do perfil para uma etapa da criação do job de migração — permitindo reaproveitar o mesmo perfil em migrações de bancos diferentes.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `docs/seguranca-e-stack.md#Controle-de-acesso` | "Sem autenticação/login na aplicação — decisão confirmada em sessão de esclarecimento... o controle de acesso assumido é só o perímetro de rede (VPN, uso interno)." Esta feature reverte essa decisão explicitamente | 🟢 |
| `_reversa_sdd/architecture.md#Visão-geral` | O legado CLI (`migrate_routines.py`) também "não há... autenticação, nem múltiplos usuários concorrentes — cada execução é síncrona, de ponta a ponta, num único processo" — não existe precedente de auth nem no legado nem na versão web atual, esta é capacidade nova | 🟢 |
| `src/core/db/migrations/001_init.sql:7-18` | `connection_profiles` hoje tem `database_name VARCHAR(120)` nullable e nenhuma coluna de dono (`user_id`) — schema atual não modela nem usuário nem desacoplamento de banco | 🟢 |
| `src/core/credentialVault.ts:132-144` (`resolveForConnection`) | O `database` retornado para `ConnectionParams` vem direto de `row.database_name` — é o ponto exato que amarra o perfil a um banco fixo; terá que aceitar um banco explícito por chamada em vez de só o da linha do perfil | 🟢 |
| `src/core/jobRunner.ts:206-208` (`runJob`) | `resolveForConnection(job.source_profile_id)` / `resolveForConnection(job.target_profile_id)` são chamados sem nenhum parâmetro de banco — é aqui que a nova etapa de escolha de banco por job precisa entrar | 🟢 |
| `src/features/tables/routes.ts:38`, `src/features/routines/routes.ts:35` | `createdBy: body.createdBy ?? "unknown"` — campo de texto livre opcional, sem nenhuma verificação; hoje não existe identidade real de quem disparou um job | 🟢 |
| `web/src/screens/connectionProfiles.ts:17-26` | Formulário de novo perfil tem campo "Banco (opcional)" — será removido; a tela passa a listar só os perfis do usuário autenticado, nunca de outros usuários (RN-02, escopo estritamente privado) | 🟢 |
| `src/core/connectionManager.ts:87-109` (`connectWithAutoCreateDatabase`) | O flag `createDatabaseIfMissing` já é passado por job (não pelo perfil) desde a feature `migracao-de-tabelas`/`002` — só o *nome* do banco em si (`params.database`) ainda vem do perfil; esta feature completa o desacoplamento que faltava | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Operador (agora autenticado com usuário/senha próprios da aplicação) | Fazer login uma vez e reutilizar o mesmo perfil de conexão (ex.: "MySQL prod origem") em várias migrações, para bancos diferentes, sem recriar um perfil por banco | Loga na aplicação, abre "Perfis de conexão" e vê só os perfis que ele mesmo criou; ao iniciar uma nova migração, escolhe o perfil de origem e destino e, numa etapa nova do wizard, digita explicitamente o nome do banco de origem e de destino daquela migração específica |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Toda rota da API, exceto a de login (e um eventual health-check), passa a exigir sessão de usuário autenticado válida; requisição sem sessão recebe `401`. 🟢
   - Origem no legado: nenhuma — reverte explicitamente a postura documentada em `docs/seguranca-e-stack.md#Controle-de-acesso` ("sem autenticação/login na aplicação").
   - Tipo: nova
2. **RN-02:** Cada `connection_profile` passa a ter um dono (`user_id`, o usuário autenticado que o criou) e é **estritamente privado**: só o dono vê ou usa o perfil que criou; nenhum outro usuário autenticado tem acesso a ele (decidido em `/reversa-clarify`, 2026-09-22). 🟢
   - Origem no legado: `src/core/db/migrations/001_init.sql:7-18` (schema atual sem `user_id`).
   - Tipo: alterada
3. **RN-03:** `connection_profiles` deixa de ter `database_name`. O nome do banco de origem e do banco de destino passam a ser informados na etapa de criação de cada job de migração, não no cadastro do perfil — permitindo reaproveitar o mesmo perfil (host/porta/usuário/senha) em migrações contra bancos diferentes. Nesta entrega isso vale concretamente para `tables` e `routines` (únicas rotas de job existentes no backend web hoje); `config` e `collation_fix` seguem o mesmo princípio quando forem implementadas como rotas web, fora do escopo desta feature (decidido em `/reversa-clarify`, 2026-09-22). 🟢
   - Origem no legado: `src/core/credentialVault.ts:132-144`, `src/core/db/migrations/001_init.sql:14` (`database_name` atual no perfil).
   - Tipo: alterada
4. **RN-04:** `created_by` de `migration_jobs` deixa de ser texto livre opcional (`"unknown"` como default) e passa a ser preenchido automaticamente com a identidade do usuário autenticado que disparou o job. 🟢
   - Origem no legado: `src/features/tables/routes.ts:38`, `src/features/routines/routes.ts:35` (campo livre atual).
   - Tipo: alterada

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Nova tabela no App DB para usuários da aplicação (id, identificador de login, hash de senha, timestamps) — migration SQL nova (`004_*.sql`, seguindo o padrão de `001`–`003`) | Must | Migration roda de forma idempotente (`IF NOT EXISTS`, mesmo padrão das anteriores) contra um App DB já populado, sem quebrar dados existentes | 🟢 |
| RF-02 | Senha do usuário de aplicação é armazenada com hash forte e salgado, de algoritmo dedicado a senhas (resistente a força bruta) e nunca reversível — diferente do cofre de credenciais MySQL (`credentialVault.ts`), que é cifrado mas reversível por design (RF-02 exige o oposto: irreversível) | Must | Inspecionar a coluna de senha no App DB não permite recuperar a senha em texto claro por nenhum meio, nem por quem tem acesso de leitura ao banco | 🟢 |
| RF-03 | Endpoint/tela de login: usuário informa identificador + senha; sucesso cria uma sessão autenticada; falha retorna erro genérico (sem indicar se o identificador existe) | Must | Login com credenciais corretas concede acesso; login com credenciais erradas é recusado com mensagem genérica, sem distinguir "usuário não existe" de "senha errada" | 🟢 |
| RF-04 | Logout: endpoint/ação que encerra a sessão atual | Must | Após logout, requisições subsequentes com a sessão antiga recebem `401` | 🟢 |
| RF-05 | Middleware de autenticação aplicado a todas as rotas existentes (`/connection-profiles*`, `/tables/*`, `/routines/*`, `/jobs*`, etc.), exceto login | Must | Chamar qualquer rota protegida sem sessão válida retorna `401` antes de tocar qualquer lógica de negócio | 🟢 |
| RF-06 | `POST /connection-profiles` passa a gravar `user_id` do usuário autenticado da sessão; `GET /connection-profiles` (e `GET`/`DELETE /connection-profiles/:id`) retornam/aceitam somente perfis cujo `user_id` é o do usuário autenticado (RN-02, escopo estritamente privado) | Must | Perfil criado por um usuário aparece associado a ele no banco (`user_id` preenchido); um segundo usuário autenticado não vê nem consegue acessar por id o perfil do primeiro | 🟢 |
| RF-07 | Formulário "Novo perfil" (`web/src/screens/connectionProfiles.ts`) remove o campo "Banco (opcional)" — perfil passa a ter só rótulo, host, porta, usuário, senha | Must | Criar um perfil não pede mais nome de banco; a tabela de listagem de perfis deixa de exibir a coluna "Banco" | 🟢 |
| RF-08 | Migration `ALTER TABLE connection_profiles`: remove `database_name`, adiciona `user_id` (FK para a nova tabela de usuários, `NOT NULL`). Os `connection_profiles` já existentes na VM `hermes` (cadastrados antes desta feature, sem dono) são **excluídos** pela própria migration — não há tentativa de atribuí-los a um usuário; cada operador recadastra, já autenticado, os perfis que precisar (decidido em `/reversa-clarify`, 2026-09-22) | Must | Rodar a migration contra o App DB atual da VM `hermes` remove os perfis pré-existentes sem erro; a tabela fica pronta para receber perfis novos, todos com `user_id` preenchido | 🟢 |
| RF-09 | Nova etapa no wizard (antes de disparar o job de `tables`/`routines`) para informar explicitamente o nome do banco de origem e o nome do banco de destino daquela migração | Must | Ao criar um job, a UI pede o banco de origem e o banco de destino como campos próprios da etapa, não mais herdados do perfil selecionado | 🟢 |
| RF-10 | `POST /tables/jobs` e `POST /routines/jobs` (únicas rotas de criação de job existentes no backend web) passam a receber `sourceDatabase`/`targetDatabase` explícitos no corpo da requisição, em vez de resolver o banco a partir do perfil. Rotas de `config`/`collation_fix` ficam fora do escopo desta feature, por ainda não existirem no backend web (decidido em `/reversa-clarify`, 2026-09-22) | Must | Duas migrações usando o mesmo `targetProfileId` mas `targetDatabase` diferentes criam jobs corretos, cada um contra o banco informado | 🟢 |
| RF-11 | `resolveForConnection`/`connect`/`connectWithAutoCreateDatabase` passam a receber o nome do banco como parâmetro explícito da chamada, em vez de o lerem da linha do perfil | Must | Uma mesma credencial de perfil consegue abrir conexões para dois bancos diferentes em duas chamadas distintas, sem precisar de dois perfis | 🟢 |
| RF-12 | `migration_jobs.created_by` passa a ser preenchido com a identidade do usuário autenticado da sessão, não mais um campo de formulário livre | Should | Um job criado por um usuário logado aparece no histórico (`GET /jobs`) com `createdBy` igual à identidade desse usuário, sem depender de o cliente enviar o campo | 🟢 |
| RF-13 | Cadastro de usuário é **fechado**: endpoint/tela para criar um novo usuário da aplicação só é acessível a partir de uma sessão já autenticada (protegido pelo mesmo middleware do RF-05); não existe tela de cadastro pública/anônima. O primeiro usuário (necessário para o primeiro login possível, já que criar usuário exige sessão) é criado fora da aplicação, por script/seed manual — mesmo padrão operacional de `CREDENTIAL_VAULT_KEY` hoje (variável/procedimento configurado direto na VM, `docs/deploy-hermes.md`), não uma rota HTTP (decidido em `/reversa-clarify`, 2026-09-22) | Must | Chamar o endpoint de criação de usuário sem sessão autenticada retorna `401`, igual a qualquer outra rota protegida; não há rota de cadastro alcançável sem login prévio; existe um procedimento documentado (script) para criar o primeiro usuário do zero | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Segurança | Sessão de aplicação via cookie `httpOnly` (não acessível por JavaScript do frontend), consistente com a stack Fastify já em uso, com duração de **2 horas** — expirada, o usuário precisa logar de novo (decidido em `/reversa-clarify`, 2026-09-22) | Padrão comum para este tipo de stack; duração confirmada pelo operador | 🟢 |
| Segurança | O cofre de credenciais MySQL (`credentialVault.ts`) continua sem alterações no algoritmo/chave — esta feature não introduz autenticação MySQL nova, só autenticação de aplicação. `CREDENTIAL_VAULT_KEY` e `RISK-005` (`docs/seguranca-e-stack.md`) permanecem como estão | Escopo desta feature é login de aplicação + desacoplamento de perfil/banco, não o cofre de credenciais MySQL | 🟢 |
| Segurança | Login com identificador/senha inválidos não deve revelar se o identificador existe (RF-03) — mitiga enumeração de contas | Prática padrão de autenticação; nenhuma spec do projeto documenta exceção | 🟡 |
| Compatibilidade | A migration de schema (RF-01/RF-08) precisa rodar contra o App DB da VM `hermes` já em uso (`docs/deploy-hermes.md`), sem exigir recriação do banco do zero | Ambiente de teste já existe e tem dados reais de perfis/jobs, conforme `docs/deploy-hermes.md` | 🟢 |
| Escopo | Recuperação/reset de senha do usuário da aplicação fica fora do escopo desta entrega — sem essa funcionalidade, um usuário que esquece a senha precisa de intervenção manual no banco | Não mencionado pelo operador na descrição da feature; tratado como Won't nesta rodada | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Login com credenciais corretas
  Dado que existe um usuário de aplicação cadastrado
  Quando ele informa identificador e senha corretos na tela de login
  Então uma sessão autenticada é criada
  E ele consegue acessar as telas protegidas (perfis, wizard, histórico)

Cenário: Login com credenciais incorretas
  Dado que existe um usuário de aplicação cadastrado
  Quando alguém tenta logar com identificador correto e senha errada, ou com identificador inexistente
  Então o acesso é recusado com uma mensagem genérica, sem indicar qual dos dois dados estava errado

Cenário: Acesso sem sessão é recusado
  Dado que nenhuma sessão autenticada existe
  Quando uma requisição é feita diretamente a uma rota protegida (ex. GET /connection-profiles)
  Então a resposta é 401, sem expor nenhum dado de perfil ou job

Cenário: Logout encerra a sessão
  Dado um usuário com sessão autenticada ativa
  Quando ele faz logout
  Então uma nova requisição com essa mesma sessão a uma rota protegida recebe 401

Cenário: Perfil de conexão sem campo de banco
  Dado um usuário autenticado
  Quando ele cria um novo perfil de conexão informando rótulo, host, porta, usuário e senha
  Então o perfil é salvo associado a ele, sem nenhum campo de nome de banco

Cenário: Reaproveitar o mesmo perfil em migrações de bancos diferentes
  Dado um perfil de conexão já cadastrado (mesmo host/usuário/senha)
  Quando o usuário cria uma migração informando um banco de origem/destino "A"
  E depois cria uma segunda migração com o mesmo perfil, mas banco de origem/destino "B"
  Então ambos os jobs são criados corretamente, cada um contra o banco informado na sua própria etapa
  E nenhum perfil novo precisou ser cadastrado para a segunda migração
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|----------------|
| RF-01 a RF-11, RF-13 | Must | Sem autenticação de ponta a ponta (RF-01–RF-06, RF-13) e sem o desacoplamento perfil/banco (RF-07–RF-11) a feature não entrega nem o pedido de login nem o de reaproveitamento de perfil — os dois pilares descritos pelo operador |
| RF-12 | Should | Coerência do histórico de jobs com a nova identidade de usuário; não bloqueia o núcleo da feature se ficar para depois |

## 9. Esclarecimentos

### Sessão 2026-09-22

- **Q:** Como novos usuários da aplicação são cadastrados?
  **R:** Fechado, via aplicação — só um usuário já autenticado pode criar outros usuários (tela/endpoint restrito, sem cadastro público) (opção b).
- **Q:** Perfis de conexão criados por um usuário podem ser vistos/usados por outros usuários autenticados, ou ficam estritamente privados ao dono?
  **R:** Estritamente privados — só o dono vê e usa o perfil que criou (opção a).
- **Q:** Os perfis de conexão já existentes na VM `hermes` (sem `user_id`) devem, ao rodar a migration, ser atribuídos a um usuário seed, ficar com `user_id` nulo, ou ser excluídos?
  **R:** Excluídos — cada operador recadastra os perfis que precisa, já associados a si mesmo (opção c).
- **Q:** O RF-10 (banco de origem/destino explícito na criação do job) deve cobrir só `tables`/`routines`, ou também criar as rotas de `config`/`collation_fix` do zero?
  **R:** Só `tables` e `routines` — as únicas rotas de job que existem hoje no backend web (opção a).
- **Q:** Duração da sessão de login, antes de exigir novo login?
  **R:** 2 horas.

## 10. Lacunas

Nenhuma lacuna pendente — as 3 dúvidas do documento inicial foram resolvidas em `/reversa-clarify` (sessão de 2026-09-22, ver Esclarecimentos acima).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-09-22 | `/reversa-clarify`: resolvidas DÚVIDA-1 (cadastro fechado, via app), DÚVIDA-2 (perfis estritamente privados), DÚVIDA-3 (perfis existentes excluídos na migration), escopo do RF-10 restrito a `tables`/`routines`, e duração de sessão (2h) — zero `[DÚVIDA]` pendentes | reversa |
