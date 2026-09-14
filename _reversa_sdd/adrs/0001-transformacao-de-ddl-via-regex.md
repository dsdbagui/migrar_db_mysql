# ADR-0001 — Transformação de DDL via regex, não via parser SQL

- **Status:** Aceito (implícito — em uso na única versão do código)
- **Confiança:** 🟡 INFERIDO (sem registro de decisão; inferido da arquitetura)

## Contexto

O script precisa detectar e corrigir dezenas de padrões de incompatibilidade entre MySQL 5.x e 8.x em DDL de rotinas e tabelas (`DEFINER`, `SET OPTION`, `TYPE=`, `utf8`→`utf8mb4`, etc. — ver `code-analysis.md`).

## Decisão

Cada correção é implementada como uma função independente que aplica uma ou mais expressões regulares (`re.sub`/`re.search`) diretamente sobre o texto do DDL, em vez de parsear o SQL para uma AST e transformá-la estruturalmente. Todas as ~15 transformações seguem o mesmo contrato: `(ddl: str) -> tuple[str, Optional[Issue]]`.

## Consequências

- ✅ Simplicidade: cada transformação é pequena, legível e testável isoladamente (nenhuma depende de estado externo além do DDL de entrada).
- ✅ Sem dependência de uma biblioteca de parsing SQL (menor superfície de dependências — só `mysql-connector-python` e `rich`, ambas opcionais na segunda).
- ⚠️ Falsos positivos possíveis quando o padrão aparece em contexto não intencional — documentado em `code-analysis.md` para `fix_only_full_group_by` (`SELECT * ... GROUP BY` via `re.DOTALL` pode casar através de statements não relacionados).
- ⚠️ Correções que exigiriam reescrever a estrutura do DDL (não apenas substituir um token) não são viáveis com esta abordagem — por isso funções como `fix_old_password_hash` só avisam, não corrigem.
