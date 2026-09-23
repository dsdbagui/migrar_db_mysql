# Deploy em VM limpa — migra_db_mysql (prometeu)

_2026-09-23_

Roteiro para instalar a versão web do `migrar_db_mysql` (branch `migracao-web-stack`) numa VM sem nada instalado. Escrito para a **prometeu**, mas vale para qualquer Ubuntu 24.04. Diferente da hermes (`docs/deploy-hermes.md`), aqui a VM é dedicada à aplicação: o nginx serve só ela, na raiz do domínio, e o backend roda como serviço do systemd.

## Ambiente

|  |  |
| --- | --- |
| VM | `prometeu`, Oracle Cloud Infrastructure (KVM) |
| Sistema | Ubuntu 24.04.5 LTS, kernel `6.17.0-*-oracle` |
| Endereço | `https://prometeu.grupoqw.local/` |
| Rede | Atrás da VPN, sem exposição direta à internet. Saída para a internet via gateway (necessária durante a instalação: apt, NodeSource, npm, GitHub) |

## Como fica a aplicação

```text
Navegador (VPN) ──HTTPS 443──> nginx ─┬─ /        → arquivos estáticos (web/dist)
                                      └─ /api/    → backend Node, 127.0.0.1:3000 (systemd)
                                                        │
                                                        └─> MySQL local 127.0.0.1:3306 (App DB)
```

- Só as portas **443** (e **80**, para redirecionar a 443) ficam abertas. 3000 (API) e 3306 (MySQL) nunca devem ser acessíveis de fora da VM.
- **HTTPS é obrigatório.** O cookie de sessão tem o atributo `Secure`, e por HTTP o navegador o descarta, então ninguém consegue manter o login.

## Pré-requisitos

- [ ] Acesso SSH à VM com `sudo`
- [ ] Saída para a internet pelo gateway (para instalar os pacotes)
- [ ] `prometeu.grupoqw.local` resolvendo, no DNS interno, para o IP da VM
- [ ] Regra de entrada na Security List/NSG da OCI liberando TCP 443 (e 80) para a faixa da VPN
- [ ] Certificado TLS: da CA interna da empresa (preferível) ou autoassinado (passo 8)

> **Sobre o domínio `.local`:** `.local` é reservado ao mDNS (Bonjour/Avahi). Em Windows costuma funcionar pelo DNS interno normalmente. Em macOS e em alguns Linux, o sistema pode tentar resolver por multicast e falhar ou demorar. Se isso acontecer em alguma máquina cliente, o caminho é ajustar o resolvedor dela ou usar um domínio interno fora de `.local`.

## 1. Pacotes do sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx mysql-server curl ca-certificates

# Node.js 20 LTS (NodeSource). O projeto exige Node >= 20.6 (--env-file nos scripts).
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

## 2. Liberar HTTPS no firewall da própria VM

As imagens Ubuntu da Oracle Cloud vêm com regras de `iptables` que **rejeitam tudo exceto SSH**, mesmo com a Security List/NSG liberada. É preciso abrir 80 e 443 também na VM:

```bash
sudo iptables -L INPUT --line-numbers   # veja a linha do REJECT final
sudo iptables -I INPUT 5 -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 80  -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
```

(Use um número de linha **anterior** à regra `REJECT`. Não use `ufw` junto com essas regras: as duas ferramentas brigam entre si.)

## 3. Usuário de serviço e código

A aplicação roda com um usuário próprio, sem shell interativo e sem ser o `root`:

```bash
sudo useradd --system --create-home --home-dir /opt/migracao --shell /usr/sbin/nologin migracao
```

Acesso ao GitHub com uma **deploy key** somente leitura, como na hermes:

```bash
sudo -u migracao install -d -m 700 /opt/migracao/.ssh
sudo -u migracao ssh-keygen -t ed25519 -N '' -f /opt/migracao/.ssh/id_ed25519 -C "deploy prometeu"
sudo cat /opt/migracao/.ssh/id_ed25519.pub
# GitHub → dsdbagui/migrar_db_mysql → Settings → Deploy keys → Add (sem "Allow write access")
```

Se o gateway bloquear SSH na porta 22 para o GitHub, use SSH pela porta 443:

```bash
sudo -u migracao tee /opt/migracao/.ssh/config >/dev/null <<'EOF'
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
EOF
```

Clonar e instalar dependências:

```bash
sudo -u migracao git clone -b migracao-web-stack git@github.com:dsdbagui/migrar_db_mysql.git /opt/migracao/app
cd /opt/migracao/app
sudo -u migracao npm ci
sudo -u migracao bash -c 'cd web && npm ci'
```

A partir daqui, todos os comandos rodam em `/opt/migracao/app`.

## 4. App DB (MySQL local)

```bash
sudo mysql <<'SQL'
CREATE DATABASE app_migracao CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'app_migracao'@'127.0.0.1' IDENTIFIED BY '<SENHA_DO_APP_DB>';
GRANT ALL PRIVILEGES ON app_migracao.* TO 'app_migracao'@'127.0.0.1';
SQL
```

- **Não altere o `root@localhost`**, que continua com `auth_socket`. Mudar o método de autenticação dele quebrou o `sudo mysql` na hermes.
- O usuário existe só em `127.0.0.1`: o banco não é acessível pela rede.
- O MySQL do Ubuntu já escuta só em `127.0.0.1` por padrão. Confira com `ss -ltn | grep 3306`.

## 5. Configuração

**Backend** (`/opt/migracao/app/.env`, fora do git):

```bash
sudo -u migracao tee .env >/dev/null <<'EOF'
APP_DB_HOST=127.0.0.1
APP_DB_PORT=3306
APP_DB_USER=app_migracao
APP_DB_PASSWORD=<SENHA_DO_APP_DB>
APP_DB_NAME=app_migracao
PORT=3000
CORS_ORIGIN=https://prometeu.grupoqw.local
EOF
sudo chmod 600 .env
```

**Chave do cofre de credenciais**, fora da pasta do projeto e legível só pelo root (o systemd a entrega ao processo):

```bash
sudo install -d -m 700 /etc/migracao
KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "CREDENTIAL_VAULT_KEY=$KEY" | sudo tee /etc/migracao/vault.env >/dev/null
sudo chmod 600 /etc/migracao/vault.env
echo "$KEY"; unset KEY   # copie para o cofre de senhas da equipe
```

> **Guarde uma cópia da chave no cofre de senhas da equipe**, separada dos backups do banco. Sem ela, as senhas dos perfis de conexão ficam ilegíveis e os perfis precisam ser recadastrados. Com ela e um dump do banco juntos, todas as senhas ficam expostas.

**Frontend** (`web/.env`, lido só no build). A URL relativa funciona com qualquer nome ou IP da VM:

```bash
echo "VITE_API_URL=/api" | sudo -u migracao tee web/.env >/dev/null
```

## 6. Banco e primeiro usuário da aplicação

```bash
sudo -u migracao npm run migrate
sudo -u migracao npm run create-user -- <seu_usuario>
```

O `create-user` pede a senha sem mostrá-la na tela, com confirmação e no mínimo 8 caracteres. Sem esse usuário ninguém consegue entrar: não existe cadastro público.

## 7. Build

```bash
sudo -u migracao npm run build                          # backend → dist/
sudo -u migracao bash -c 'cd web && npx vite build'     # frontend → web/dist/
sudo chmod o+x /opt/migracao                            # o nginx precisa atravessar o diretório
```

## 8. Certificado TLS

**Opção A — CA interna da empresa (preferível).** Peça um certificado para `prometeu.grupoqw.local` e grave:

- `/etc/ssl/certs/prometeu.crt` (certificado + cadeia intermediária)
- `/etc/ssl/private/prometeu.key` (`chmod 600`)

Os navegadores que já confiam na CA interna abrem sem aviso.

**Opção B — autoassinado (piloto).** Os navegadores mostram aviso até cada usuário aceitar o certificado. Depois de aceito, login e cookie funcionam normalmente.

```bash
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout /etc/ssl/private/prometeu.key -out /etc/ssl/certs/prometeu.crt \
  -subj "/CN=prometeu.grupoqw.local" \
  -addext "subjectAltName=DNS:prometeu.grupoqw.local"
sudo chmod 600 /etc/ssl/private/prometeu.key
```

(O `subjectAltName` é obrigatório: navegadores atuais ignoram o `CN` sozinho.)

## 9. Backend como serviço (systemd)

```bash
sudo tee /etc/systemd/system/migracao-api.service >/dev/null <<'EOF'
[Unit]
Description=migra_db_mysql API
After=network.target mysql.service
Requires=mysql.service

[Service]
User=migracao
Group=migracao
WorkingDirectory=/opt/migracao/app
EnvironmentFile=/etc/migracao/vault.env
ExecStart=/usr/bin/node --env-file=.env dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now migracao-api
sudo systemctl status migracao-api --no-pager
```

A chave chega ao processo pelo `EnvironmentFile`. Variáveis já definidas no ambiente têm precedência sobre o `.env`.

## 10. Nginx

```bash
sudo tee /etc/nginx/sites-available/migracao >/dev/null <<'EOF'
server {
    listen 80;
    server_name prometeu.grupoqw.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;   # nginx 1.24 do Ubuntu 24.04 não aceita a diretiva "http2 on;"
    server_name prometeu.grupoqw.local;

    ssl_certificate     /etc/ssl/certs/prometeu.crt;
    ssl_certificate_key /etc/ssl/private/prometeu.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Frontend (build estático)
    root /opt/migracao/app/web/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API — a barra final do proxy_pass remove o prefixo /api
    location /api/ {
        proxy_pass         http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/migracao /etc/nginx/sites-enabled/migracao
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 11. Verificação

Na própria VM:

```bash
curl -s http://127.0.0.1:3000/health                                                    # {"status":"ok"}
curl -sk https://prometeu.grupoqw.local/api/health                                     # {"status":"ok"}
curl -sk -o /dev/null -w '%{http_code}\n' https://prometeu.grupoqw.local/api/jobs      # 401 (sem login)
ss -ltn | grep -E ':3000|:3306'   # 3306 só em 127.0.0.1. A 3000 aparece em 0.0.0.0, mas fica bloqueada pelo iptables do passo 2
```

De uma máquina na VPN, abra **https://prometeu.grupoqw.local/**, entre com o usuário do passo 6, cadastre um perfil de conexão e rode o preview de uma migração.

De fora da VM, `curl http://prometeu.grupoqw.local:3000/health` **não pode** responder. Se responder, revise o passo 2 e a NSG.

## Operação

| Tarefa | Comando |
| --- | --- |
| Logs do backend | `sudo journalctl -u migracao-api -f` |
| Reiniciar backend | `sudo systemctl restart migracao-api` |
| Criar usuário | `cd /opt/migracao/app && sudo -u migracao npm run create-user -- <usuario>` |
| Redefinir senha de alguém | `cd /opt/migracao/app && sudo -u migracao npm run create-user -- --reset <usuario>` (encerra as sessões dele) |
| Backup do App DB | `sudo mysqldump --single-transaction app_migracao > app_migracao_$(date +%F).sql`, guardado **longe** da chave do cofre |

### Atualizar para uma versão nova

```bash
cd /opt/migracao/app
sudo -u migracao git pull
sudo -u migracao npm ci && sudo -u migracao bash -c 'cd web && npm ci'
sudo -u migracao npm run migrate          # idempotente, pode rodar sempre
sudo -u migracao npm run build
sudo -u migracao bash -c 'cd web && npx vite build'
sudo systemctl restart migracao-api
```

Antes de atualizar, confira se não há job em execução (tela "Histórico"): o `restart` interrompe o job em andamento.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Login "funciona", mas volta sempre para a tela de login | Acesso por HTTP em vez de HTTPS: o cookie `Secure` é descartado |
| `502 Bad Gateway` em `/api/...` | Backend parado: `systemctl status migracao-api`, `journalctl -u migracao-api` |
| Backend não sobe: `CREDENTIAL_VAULT_KEY não configurada` | `/etc/migracao/vault.env` ausente ou fora do `EnvironmentFile` |
| Página não abre de fora, mas `curl` na VM funciona | `iptables` da VM (passo 2) ou NSG/Security List da OCI |
| Nome não resolve num Mac/Linux | Domínio `.local` indo para o mDNS (ver Pré-requisitos) |
| Tela em branco com 404 nos `.js` | Build do frontend feito com `--base` diferente de `/`. Refaça o passo 7 sem `--base` |

## Referências

| Documento | Conteúdo |
| --- | --- |
| `docs/seguranca-e-stack.md` | Stack, autenticação, cofre de credenciais, checklist de produção |
| `docs/deploy-hermes.md` | Deploy anterior (VM compartilhada com FastAPI, sob `/migracao/`) |
| `_reversa_forward/006-redefinicao-de-senha/interfaces/cli-create-user.md` | Uso completo do `create-user` e códigos de saída |
