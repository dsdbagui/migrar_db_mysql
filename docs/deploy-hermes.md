# Deploy em VM — migra_db_mysql (hermes)

_2026-09-21_

## Resumo

A versão web do `migrar_db_mysql` (branch `migracao-web-stack`) foi implantada na VM `hermes` (10.33.0.22) para teste com outro operador. Nenhum recurso novo foi aberto na Security List/NSG da VCN — a aplicação foi pendurada atrás do nginx já existente, na mesma porta 443 já usada pelo FastAPI, sob o caminho `/migracao/`.

## Ambiente

|  |  |
| --- | --- |
| VM | `hermes` |
| IP | `10.33.0.22` (privado, sem saída à internet pública — acessível só na rede interna/VPN) |
| Provedor | Oracle Cloud Infrastructure (OCI) |
| Diretório do projeto | `~/projects/migrar_db_mysql` |

A VM já hospedava uma aplicação FastAPI em produção (porta interna `8000`, exposta via nginx em `10.33.0.22:443`). Nenhuma alteração foi feita nessa aplicação ou na sua configuração — a implantação nova coexiste no mesmo host, mesmo nginx.

## Software instalado

- **Node.js 20 LTS** — via repositório NodeSource (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` + `apt install nodejs`). Não havia Node na VM antes.
- **`mysql-server`** (pacote do sistema, via `apt`) — para o App DB da aplicação (perfis de conexão, histórico de jobs). Optou-se por instalação nativa em vez de Docker (a VM não tinha Docker e o App DB é uma carga leve e permanente — não há vantagem clara em containerizar só isso aqui).

## Acesso ao repositório

A VM não tinha chave SSH cadastrada no GitHub. Foi gerada uma **deploy key** dedicada (`ssh-keygen -t ed25519`, salva separada da chave pessoal), cadastrada em GitHub → repositório `dsdbagui/migrar_db_mysql` → Settings → Deploy keys, com acesso **somente leitura**.

```bash
git clone git@github.com:dsdbagui/migrar_db_mysql.git
git checkout migracao-web-stack
```

O repositório está clonado em `~/projects/migrar_db_mysql`, na branch `migracao-web-stack`.

## Banco de dados (App DB)

Banco `app_migracao` criado no MySQL local da VM (`mysql-server` reciém-instalado). Guarda só estado da própria aplicação — perfis de conexão (cifrados) e histórico de jobs — nunca os bancos MySQL que a ferramenta migra.

**Usuário dedicado**, sem usar `root`:

```sql
CREATE USER 'app_migracao'@'%' IDENTIFIED WITH mysql_native_password BY '<senha>';
GRANT ALL PRIVILEGES ON app_migracao.* TO 'app_migracao'@'%';
FLUSH PRIVILEGES;
```

(a conta foi criada tanto para `%` quanto `127.0.0.1` durante o troubleshooting da conexão — só a de `%` acabou sendo necessária; a duplicata pode ser removida.)

**Incidente durante a instalação, já corrigido:** uma tentativa inicial alterou a conta `root@localhost` para usar `mysql_native_password` em vez do `auth_socket` padrão do Debian/Ubuntu — isso quebrou o acesso `sudo mysql` sem senha. Foi recuperado usando a conta de manutenção do sistema (`/etc/mysql/debian.cnf`) para reverter `root@localhost` de volta a `auth_socket`. **Estado atual confirmado:** `root@localhost` está de volta ao `auth_socket` (comportamento padrão do pacote); nenhuma outra conta `root` foi criada ou alterada.

## Configuração da aplicação

Dois arquivos `.env`, nenhum versionado (`.gitignore`), gerados pelo script `scripts/deploy-vm.sh`:

**`.env`** (raiz — backend):

```
APP_DB_HOST=127.0.0.1
APP_DB_PORT=3306
APP_DB_USER=app_migracao
APP_DB_PASSWORD=<senha>
APP_DB_NAME=app_migracao
CREDENTIAL_VAULT_KEY=<gerada localmente na VM, 32 bytes hex>
PORT=3000
CORS_ORIGIN=http://10.33.0.22:5173
```

**`web/.env`** (frontend) — ajustado manualmente depois, para passar pelo nginx em vez da porta 3000 direto:

```
VITE_API_URL=https://10.33.0.22/migracao-api
```

Como frontend e API ficam sob a mesma origem (`https://10.33.0.22`) atrás do nginx, o `CORS_ORIGIN` do backend deixou de ser relevante para esse acesso (nunca chega a acionar CORS no navegador), mas foi deixado como está — não atrapalha.

## Build e execução

```bash
# migrations no App DB
npm run migrate

# backend: build de produção + start
npm run build
nohup npm start > backend.log 2>&1 &
disown

# frontend: build com o prefixo /migracao/ (necessário por rodar atrás do nginx numa subrota)
cd web
npx vite build --base=/migracao/
nohup npx vite preview --host 0.0.0.0 --port 5173 > ../frontend.log 2>&1 &
disown
```

- Backend escuta em `0.0.0.0:3000`, frontend (`vite preview`) em `0.0.0.0:5173` — nenhuma das duas portas está exposta diretamente para fora da VM (só o nginx, na 443, está na Security List).
- **Sem supervisor de processo** (nem systemd unit, nem pm2) — ambos foram subidos com `nohup ... & disown`. Se a VM reiniciar ou o processo cair, precisa subir manualmente de novo com os mesmos comandos.
- Logs em texto simples, sem rotação: `~/projects/migrar_db_mysql/backend.log` e `frontend.log`.

## Nginx

Arquivo alterado: **`/etc/nginx/sites-available/fastapi`** — o mesmo arquivo já usado pelo FastAPI em produção nessa VM. Dois blocos `location` novos foram adicionados dentro do `server { listen 10.33.0.22:443 ssl; ... }` já existente, **sem alterar** o `location /` original (FastAPI) nem o bloco de redirecionamento HTTP→HTTPS:

```nginx
location /migracao/ {
    proxy_pass         http://127.0.0.1:5173/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /migracao-api/ {
    proxy_pass         http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Aplicado com `sudo nginx -t && sudo systemctl reload nginx` (reload, não restart — sem downtime pro FastAPI). **Nenhuma porta nova foi aberta na Security List/NSG da VCN** — a 443 já estava liberada para o FastAPI, e a aplicação nova reaproveita exatamente essa mesma porta/certificado.

## Resultado

Link de acesso (rede interna/VPN):

**https://10.33.0.22/migracao/**

(com a barra final — sem ela, a rota cai no `location /` do FastAPI). Certificado autoassinado (o mesmo já usado pelo FastAPI nessa VM), o navegador vai mostrar aviso de segurança normalmente.

## Pontos de atenção para a infraestrutura

- **Sem autenticação própria na aplicação** — qualquer pessoa com acesso à rede interna/VPN e o link usa tudo, inclusive cria/exclui perfis de conexão com credenciais de outros MySQL (cifradas em repouso, mas controláveis por quem tiver a URL). Isso é uma decisão de produto já registrada na spec (perimetro de rede como único controle de acesso), não uma falha desta implantação — mas vale a infra estar ciente antes de ampliar quem tem acesso à VM/VPN.
- **`CREDENTIAL_VAULT_KEY` só em arquivo `.env` local**, sem secret manager/KMS. Guardada em texto plano no disco da VM.
- **Sem supervisor de processo** (nenhuma systemd unit, nenhum pm2) — reboot da VM ou crash do processo exige subida manual. Recomendado antes de qualquer uso além de teste pontual.
- **Logs sem rotação** — `backend.log`/`frontend.log` crescem indefinidamente no diretório do projeto.
- **Nginx compartilhado** com o FastAPI de produção — qualquer alteração futura nesse arquivo (`/etc/nginx/sites-available/fastapi`) afeta as duas aplicações; cuidado ao editar.
- Esta é uma implantação de **teste/piloto**, não endurecida para produção — ver documento separado "Segurança e Stack" para o checklist completo de itens a decidir antes de um ambiente definitivo.
