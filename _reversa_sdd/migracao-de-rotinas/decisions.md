# migracao-de-rotinas — Decisões Arquiteturais

> Decisões que afetam especificamente esta unit. Fonte completa em `../adrs/`.

## ADR-0001 — Transformação de DDL via regex, não via parser SQL

- **Status:** Aceito (implícito) · **Confiança:** 🟡 INFERIDO

Cada correção de compatibilidade é uma função independente aplicando regex diretamente sobre o texto do DDL (`re.sub`/`re.search`), não uma AST SQL estruturada. Todas seguem o contrato `(ddl: str) -> tuple[str, Optional[Issue]]`.

**Por que importa para esta unit:** é a técnica usada por toda a `TRANSFORMATIONS` list (`remove_definer`, `fix_set_option`, `fix_old_password_hash`, `clean_sql_mode`, `fix_no_zero_date`, `fix_group_concat_maxlen`, `fix_sql_security`, `fix_no_default_charset`, `fix_only_full_group_by`). Uma reimplementação que trocasse regex por um parser SQL real mudaria a superfície de falsos positivos/negativos documentada em `design.md` (ex: o caso conhecido de `fix_only_full_group_by`) — para bem (menos falsos positivos) ou para mal (nova classe de bugs de parsing), e precisaria revalidar toda a suíte de testes de T-01 a T-04 em `tasks.md`.

**Trade-off aceito:** simplicidade e zero dependência de biblioteca de parsing, em troca de falsos positivos ocasionais e incapacidade de corrigir automaticamente problemas que exigem reescrita estrutural do DDL (por isso `fix_old_password_hash` só avisa, nunca corrige).

Ver ADR completo em `../adrs/0001-transformacao-de-ddl-via-regex.md`.

## Relação com a filosofia de correção automática vs. manual

Ver `domain.md`, seção "Sobre a filosofia de correção automática vs. manual" — o critério de quando uma `Issue` vira `error`/correção automática vs. `warning`/aviso manual é uma decisão de negócio implícita (não documentada explicitamente no código) que qualquer nova transformação adicionada a esta unit deveria seguir para manter consistência. 🟡
