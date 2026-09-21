# Investigation: Cancelamento de job

> Identificador: `003-cancelamento-de-job`
> Data: `2026-09-21`

## Pesquisa de fundo

Sem dependência externa nova. Toda a mecânica (polling de status, `UPDATE` condicional) usa a mesma infraestrutura já existente (`mysql2`, App DB). Não há biblioteca de cancelamento cooperativo a avaliar — o padrão é simples o suficiente para não justificar uma.

## Padrões aplicáveis

### Sinalização de cancelamento: polling do App DB vs. estado em memória

- **Polling de `migration_jobs.status`** (escolhido, D-01): reaproveita a fonte de verdade já persistida. Sem estado novo para gerenciar, sem risco de o processo reiniciar e "esquecer" um cancelamento pendente em memória.
- **Alternativa descartada — `AbortController`/`Map<jobId, boolean>` em memória**: seria marginalmente mais rápido (sem round-trip ao banco), mas o ganho é irrelevante — cada item já faz várias queries MySQL reais (extração, transformação, `ensureConnected`, aplicação). Além disso, duplicaria a fonte de verdade: `migration_jobs.status` já é onde o sistema registra "isso foi cancelado"; ter um segundo lugar (memória) que também precisa saber disso é uma fonte de bugs de sincronização, não uma simplificação.
- Compatível com `_reversa_sdd/migration/target_architecture.md#AD-01` (job roda sequencialmente dentro do próprio processo, sem fila/broker) — o polling funciona dentro dessa topologia sem exigir nenhuma peça de infraestrutura nova.

### O bug latente que a feature expõe (`runJob`, D-02)

Não é um "padrão" a pesquisar, é uma consequência direta de introduzir uma terceira forma de um job terminar. Antes desta feature, `runJob` (`jobRunner.ts:217-233`, numeração pós-`002`) só tinha dois desfechos possíveis para o `try/catch` em torno de `runner(ctx)`: sucesso (→ `completed`) ou exceção (→ `failed`). Os dois `UPDATE`s finais são incondicionais porque, até aqui, eram sempre corretos — não existia uma terceira parte (o endpoint de cancelamento) que pudesse ter alterado `status` enquanto `runner()` ainda rodava. Ao introduzir essa terceira parte, os `UPDATE`s incondicionais passam a ter uma janela de corrida real: se `POST /jobs/:id/cancel` gravar `'cancelled'` e, milissegundos depois, `runner()` retornar normalmente (processando o item que já estava em andamento), o `UPDATE ... SET status = 'completed'` reverteria o cancelamento sem nenhum sinal de erro. A correção (`WHERE id = ? AND status = 'running'`) é o tipo de guarda que só fica óbvia depois que se pensa no terceiro escritor concorrente — vale registrar aqui para quem for revisar o diff sem o contexto completo.

### Confirmação de UI: `confirm()` nativo vs. modal customizado

- **`confirm()` nativo** (escolhido, D-05): já usado em `connectionProfiles.ts:68` para excluir um perfil de conexão — mesma categoria de ação (destrutiva/irreversível o suficiente para justificar uma pausa antes de agir). Reaproveitar o padrão existente evita introduzir uma segunda forma de "confirmar algo" na mesma aplicação.
- **Alternativa descartada — modal HTML/CSS customizado**: mais controle visual, mas sem necessidade real aqui — o projeto não tem nenhum modal customizado hoje, e criar o primeiro só para esta ação seria decidir uma peça de design system nova a reboque de uma feature pequena.

## Links para fontes externas

Nenhum. Toda a base de decisão vem de artefatos internos já produzidos pelo Reversa (`_reversa_sdd/`, `_reversa_sdd/migration/`) e do código-fonte já implementado em `src/`.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-09-21 | Versão inicial gerada por `/reversa-plan` | reversa |
