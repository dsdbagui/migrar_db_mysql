# migra-db-mysql — Frontend

Wizard multi-step (BR-HUMANA-001) para a versão web da ferramenta de migração MySQL 5.x → 8.x.
Consome a API REST do backend em `../src/`. TypeScript puro + [Vite](https://vitejs.dev/), sem
framework de UI — decisão de manter a stack mínima, coerente com o apetite "balanced" do projeto
(ver `_reversa_sdd/migration/paradigm_decision.md`).

## Setup local

```bash
npm install
cp .env.example .env   # ajuste VITE_API_URL se o backend não estiver em localhost:3000
npm run dev
```

O backend (`../`) precisa estar rodando (`npm run dev` na raiz do projeto) e migrado (`npm run migrate`) — o que por sua vez exige um MySQL 8.x próprio para o App DB (perfis de conexão + histórico de jobs, **não** os bancos que você vai migrar) e uma `CREDENTIAL_VAULT_KEY` gerada localmente. Ver "Versão web" no `README.md` da raiz para o passo a passo completo de setup.

## Passo a passo de teste manual

Ver `_reversa_forward/001-frontend-wizard-migracao-web/onboarding.md` na raiz do projeto para o
roteiro completo (criar perfis, rodar o wizard de rotinas e de tabelas, casos negativos).

## Estrutura

```
src/
  api.ts              cliente HTTP para a API do backend
  router.ts            roteador mínimo baseado em hash
  state/wizardState.ts estado do wizard (singleton em memória, ver RN-02)
  lib/errorMessages.ts mensagens de erro amigáveis (pt-br)
  screens/
    connectionProfiles.ts   perfis de conexão (RF-01, RF-09)
    wizard/step1.ts          feature + perfis (RF-02)
    wizard/step2.ts          seleção de itens por nome (RF-03)
    wizard/step3.ts          opções por feature (RF-04)
    wizard/step4Preview.ts   preview + confirmação (RF-05, RF-06)
    jobStatus.ts             acompanhamento (RF-07)
    jobResult.ts             resultado final + relatório (RF-08, RF-10)
```

## Fora de escopo nesta entrega

- Login/autenticação — o perímetro de rede (VPN) é o controle de acesso assumido (ver
  `requirements.md` § Esclarecimentos).
- Features `config`/`collation-fix` como telas dedicadas — o wizard cobre só `routines`/`tables`,
  as duas com API pronta no backend.
