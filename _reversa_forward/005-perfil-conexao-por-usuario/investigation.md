# Investigation: Login de aplicação e perfil de conexão por usuário

> Identificador: `005-perfil-conexao-por-usuario`
> Data: `2026-09-22`

## 1. Hash de senha de usuário — algoritmo e parâmetros

**Pergunta:** que algoritmo de hash usar para `app_users.password_hash` (RF-02, irreversível), e com que parâmetros?

**Pesquisa:** o OWASP Password Storage Cheat Sheet recomenda Argon2id como primeira opção (mínimo 19 MiB de memória, 2 iterações, paralelismo 1); quando Argon2id não está disponível, recomenda scrypt como fallback memory-hard, com custo CPU/memória mínimo de 2¹⁷, block size mínimo 8, paralelismo 1; bcrypt fica reservado para sistemas legados sem acesso aos dois anteriores, com fator de trabalho mínimo 10.[^1]

Argon2id não é built-in no runtime Node.js — exigiria dependência nativa externa (pacote `argon2`, binário compilado). `bcrypt` também é dependência externa. `node:crypto.scrypt` é built-in, sem dependência nova, já é o padrão estabelecido neste projeto (`credentialVault.ts` usa `node:crypto` para o cofre de credenciais MySQL, embora ali para cifragem reversível AES-256-GCM, não hash). Boas práticas complementares levantadas: salt aleatório único por senha (mínimo 16 bytes), chave derivada de 32–64 bytes, guardar algoritmo+parâmetros+salt junto do hash (para permitir trocar parâmetros no futuro sem invalidar hashes antigos de uma vez).[^2]

**Decisão** (roadmap.md D-03): `node:crypto.scrypt`, N=131072 (2¹⁷), r=8, p=1, salt de 16 bytes, chave derivada de 64 bytes — os mínimos recomendados pelo OWASP para o fallback scrypt, sem nova dependência.

**Trade-off aceito:** Argon2id seria a recomendação primária da OWASP, mas o ganho de segurança marginal não parece justificar introduzir uma dependência nativa (binário compilado, superfície de build/deploy nova) num projeto que documenta explicitamente "stack deliberadamente mínima" (`docs/seguranca-e-stack.md`) como decisão de arquitetura. Se o cenário de ameaça mudar (ex. exposição além do perímetro VPN), vale reabrir esta decisão.

## 2. Sessão: cookie de servidor vs. JWT

**Pergunta:** como manter o usuário logado entre requisições?

**Alternativas avaliadas:**
1. **JWT assinado, sem estado no servidor** — token contém a identidade, verificado só por assinatura, sem consulta ao banco a cada requisição. Descartado: não há como revogar um JWT já emitido sem manter uma lista de revogação em algum lugar — o que reintroduz exatamente o problema que o JWT tentava evitar (estado persistido), só que mais complexo (teria que ser consultado do mesmo jeito). O requisito de logout confiável (RF-04, "após logout, sessão antiga recebe 401") não é satisfeito de forma simples por JWT puro.
2. **Sessão em Redis** — rápido, padrão de mercado para sessão. Descartado: nenhuma outra parte do sistema usa Redis/fila externa (AD-01, `target_architecture.md`, decisão explícita de não introduzir broker); adicionar Redis só para sessão contradiz a mesma decisão arquitetural já tomada para o resto do sistema.
3. **Sessão em tabela do App DB** (escolhida) — mesmo padrão que o resto do sistema já usa para todo estado (AD-03): perfis, jobs, histórico. Custo de uma consulta simples por requisição, aceitável para o volume de uso interno já declarado no brief original da migração (`_reversa_sdd/migration/migration_brief.md`).

## 3. Onde inserir a escolha de banco de origem/destino no wizard

Não foi uma pergunta de pesquisa externa, mas uma investigação de código necessária antes de desenhar o plano: ler `web/src/screens/wizard/step2.ts` mostrou que a Etapa 2 já chama `api.previewRoutines`/`api.previewTables` (que por sua vez chamam `POST /routines/preview`/`POST /tables/preview`) **antes** de qualquer confirmação de job — e esses endpoints já dependem de um `database` para consultar `information_schema`. Isso significa que colocar a pergunta de banco só "antes de disparar o job" (interpretação literal mais tardia de RF-09) quebraria a Etapa 2. A leitura de `src/features/{routines,tables}/{extract,apply,fkRecovery}.ts` confirmou que `database` já é passado como parâmetro explícito em cada função (nunca lido de uma variável global ou reconectado), o que tornou a mudança estrutural simples: um único ponto (`resolveForConnection`) precisa mudar de onde lê `database`.

## Fontes

[^1]: [Password Storage - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
[^2]: Pesquisa geral sobre `crypto.scrypt` no Node.js (parâmetros N/r/p, tamanho de salt e chave derivada, boas práticas de armazenamento) — sínteses de múltiplas fontes de documentação/tutoriais consultadas em 2026-09-22, sem uma única fonte canônica citável além da documentação oficial do Node.js (`node:crypto`).

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-22 | Versão inicial gerada por `/reversa-plan` | reversa |
