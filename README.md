# Dive Smart Factory — Dashboard

Dashboard de acompanhamento de equipe do projeto Dive Smart Factory.

Monitora entrega de sprints, atividade no GitHub, Discord e presença nas reuniões, gerando scores individuais e por time.

---

## Pré-requisitos

- [Docker](https://www.docker.com/get-started) + Docker Compose
- Tokens de API do GitHub e Discord
- `credentials.json` + `token.json` do Google (Drive/Docs/Calendar) e chaves de Fireflies, OpenAI e Notion — o servidor não inicia sem elas.
  Os scripts que geram `token.json` (`auth`) e `dashboard-drive-data.json` (`dashboard:drive`) ficam no repositório
  `meeting-automation`, não neste.

---

## Configuração rápida

**1. Clone o repositório**
```bash
git clone https://github.com/sua-org/dive-dashboard.git
cd dive-dashboard
```

**2. Configure as variáveis de ambiente**
```bash
cp .env.example .env
# Edite o .env com seus tokens
```

**3. Suba o container**
```bash
docker compose up -d
```

**4. Acesse o dashboard**
```
http://localhost:3000
```

---

## Variáveis obrigatórias

Lista completa (com as opcionais) em `.env.example`.

| Variável | Descrição |
|----------|-----------|
| `GITHUB_TOKEN` | Token de acesso pessoal do GitHub (com `read:project`, `repo`, `read:org`) |
| `GITHUB_ORG` | Organização dona dos repositórios (padrão: `Dive-Realities`) |
| `GITHUB_PROJECT_ID` | ID GraphQL do Project v2 (`PVT_...`), não o número do projeto |
| `DISCORD_BOT_TOKEN` | Token do bot do Discord |
| `DISCORD_SERVER_ID` | ID do servidor Discord |
| `SESSION_SECRET` | String aleatória para segurança das sessões |
| `DASHBOARD_OAUTH_CLIENT_ID` | Client ID do OAuth Google (para login) |
| `DASHBOARD_OAUTH_CLIENT_SECRET` | Client Secret do OAuth Google |
| `PUBLIC_URL` ou `PUBLIC_WEBHOOK_URL` | URL pública do servidor (redirect do login e webhook). `PUBLIC_WEBHOOK_URL` tem prioridade |
| `FIREFLIES_API_KEY`, `OPENAI_API_KEY`, `NOTION_TOKEN` | Exigidas na inicialização do servidor (automação de atas) |
| `GOOGLE_CREDENTIALS_PATH`, `GOOGLE_TOKEN_PATH` | Exigidas na inicialização (Drive/Docs/Calendar) |
| `FIREFLIES_WEBHOOK_SECRET` | Secret do webhook do Fireflies. Com `NODE_ENV=production`, sem ele o webhook rejeita todas as chamadas |

`NODE_ENV=production` liga o cookie `secure` (exige HTTPS; o servidor confia no primeiro proxy reverso via `trust proxy`).

---

## Comandos úteis

```bash
# Subir
docker compose up -d

# Ver logs em tempo real
docker compose logs -f

# Atualizar após mudança de código
docker compose up -d --build

# Parar
docker compose down

# Forçar atualização do cache do dashboard
docker compose exec dashboard rm -f storage/dashboard-cache.json
```

---

## Configuração dos times

Os arquivos com dados pessoais da equipe **não são versionados** (estão no `.gitignore`).
Crie-os a partir dos exemplos:

```bash
cp data/members.example.json data/members.json
cp data/teams.example.json   data/teams.json
# edite com os membros reais
```

- `data/members.json` — cadastro dos membros (GitHub, e-mails, IDs do Discord, nomes no Fireflies, papel de score, `coordinator`)
- `data/teams.json` — definição dos times e líderes (usa os `id` de `members.json`)
- `data/scoring-config.json` — pesos do sistema de score

Métricas do Drive (opcional): coloque o JSON gerado pela coleta do Drive em `data/dashboard-drive-data.json`
(a pasta `data/` é montada no container). O caminho antigo `./dashboard-drive-data.json` na raiz ainda é lido
fora do Docker, mas não é mais montado pelo `docker-compose.yml`.

Se `members.json`/`teams.json` não existirem, o servidor usa os `*.example.json` (dados fictícios) e avisa no log.

As alterações em `data/` são lidas na inicialização: depois de editar, rode `docker compose restart`.

> **Atualizando um servidor já existente:** como `data/members.json` e `data/teams.json` deixaram de ser
> versionados, um `git pull` **apaga** esses arquivos da cópia local. Faça backup antes
> (`cp data/members.json data/members.json.bak; cp data/teams.json data/teams.json.bak`) e restaure depois do pull.

O compartilhamento das atas privadas de coordenação usa `COORD_SHARE_EMAILS` (e-mails separados por vírgula);
se vazio, usa os membros com `"coordinator": true` em `data/members.json`.

---

## Autenticação

O dashboard usa Google OAuth. Para configurar:

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto → APIs & Services → Credenciais → OAuth 2.0
3. Adicione `http://SEU_HOST:3000/auth/callback` como URI de redirecionamento
4. Copie o Client ID e Secret para o `.env`

Apenas emails autorizados (`data/members.json` com papel de coordenação) conseguem acessar o dashboard.

---

## API

| Rota | Descrição |
|------|-----------|
| `GET /health` | Health check (sem autenticação) |
| `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout` | Login Google OAuth |
| `GET /api/me` | Usuário logado |
| `GET /api/dashboard` | Dados do dashboard (cache) |
| `POST /api/dashboard/refresh` | Força nova coleta |
| `GET /api/events` | Server-Sent Events (`dashboard-update`, `refresh-start`, `refresh-error`) |
| `POST /webhooks/fireflies` | Webhook do Fireflies (assinatura HMAC) |

---

## Arquitetura

```
Backend  →  Node.js + TypeScript (Express)
Frontend →  React + Vite + Chart.js
Banco    →  SQLite (sessões) + JSON (cache)
Deploy   →  Docker (single container)
```
