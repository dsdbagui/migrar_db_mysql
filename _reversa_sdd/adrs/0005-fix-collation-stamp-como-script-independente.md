# ADR-0005 — `fix_collation_stamp.py` como script separado, não integrado ao fluxo principal

- **Status:** Aceito (implícito)
- **Confiança:** 🟡 INFERIDO

## Contexto

Depois de migrar um banco (via `migrate_routines.py`) e, em algum momento posterior, converter o collation padrão do schema (ex: de `utf8mb4_unicode_ci` para `utf8mb4_0900_ai_ci`, o padrão do MySQL 8), as rotinas armazenadas continuam com o `DATABASE_COLLATION` "carimbado" no valor antigo — um problema técnico distinto da migração de versão em si.

## Decisão

Em vez de adicionar essa correção como mais uma etapa opcional dentro de `migrate_routines.py`, foi criado um segundo script totalmente independente (`fix_collation_stamp.py`), sem import cruzado — duplica seus próprios helpers de output, conexão e remoção de `DEFINER` em vez de reutilizar os de `migrate_routines.py`. Usa `.env` como mecanismo de credencial (em vez do `--config` JSON do script principal).

## Consequências

- ✅ O script resolve um problema pontual, executado numa janela de tempo diferente (depois da conversão de collation, não durante a migração de versão) — separá-lo evita acoplar seu ciclo de vida ao do script principal.
- ✅ Guarda de segurança dedicada (recusa rodar se o banco ainda não foi convertido) é específica desse cenário e não faria sentido misturada nas perguntas de `migrate_routines.py`.
- ⚠️ Duplicação de código: `info/ok/warn/error/header/ask/confirm`, `connect()` e a regex de remoção de `DEFINER` existem em ambos os arquivos, de forma independente — uma mudança num (ex: melhorar a mensagem de erro de conexão) não se propaga automaticamente para o outro. Nenhum módulo compartilhado (`utils.py` ou similar) foi extraído.
- ⚠️ Dois mecanismos de credencial diferentes na mesma base de código (`--config` JSON vs `.env`) podem confundir um operador que espera consistência entre as duas ferramentas.
