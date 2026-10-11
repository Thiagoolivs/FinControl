# FinControl

PWA pessoal de finanças (PF + PJ/MEI). Stack, convenções e design system em [`CLAUDE.md`](CLAUDE.md).

## Deploy no Railway

1. **New Project → Deploy from GitHub repo** → este repositório.
2. No mesmo projeto: **New → Database → PostgreSQL**.
3. No serviço do app, em **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET` = saída de `openssl rand -base64 48` (não troque depois: ela cifra o segredo do 2FA)
   - `LOGIN_USERNAME` e `LOGIN_PASSWORD` = seu usuário e senha de acesso
4. **Settings → Networking → Generate Domain**, apontando para a porta que aparece no log (`Local: http://localhost:8080`). Recomendado: **Settings → Deploy → Healthcheck Path** = `/api/health`.
5. Abra o domínio e entre com usuário e senha. No primeiro login o app mostra o QR do 2FA; no celular, use **Abrir no app autenticador**.

Para trocar a senha, mude `LOGIN_PASSWORD` e reinicie o serviço: o hash é atualizado no boot e as sessões abertas são encerradas.

### Bancos (Pluggy · MeuPluggy)

1. Em [meu.pluggy.ai](https://meu.pluggy.ai), crie a conta e conecte seus bancos.
2. No painel de desenvolvedor da [Pluggy](https://pluggy.ai), copie o **Client ID** e o **Client Secret** da aplicação e coloque nas Variables do app como `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
3. No app, **Config → Conexões**: escolha PF ou PJ e toque em **Conectar banco** (widget da Pluggy → MeuPluggy). Se preferir conectar pelo painel da Pluggy, cole o ID do item em "Use o ID do item".
4. Para reconectar ou renovar o consentimento, use **Reconectar** na própria conexão. Conectar de novo cria outro item e gasta a cota da Pluggy.

### Sugestões da IA (opcional)

Com `GEMINI_API_KEY` e `GEMINI_MODEL` (o nome do modelo, ex.: o Flash mais recente listado no Google AI Studio) nas Variables do app, a fila de revisão recebe sugestão de categoria e padrão para cada grupo (só as descrições vão para o Gemini, sem valores). O modelo não é fixo no código: para trocar, mude a variável e reinicie. Sem as duas, a fila funciona igual, sem sugestões.

### Sync diário (Railway Cron)

1. No app, em Variables: `CRON_SECRET` = saída de `openssl rand -hex 32`.
2. No mesmo projeto: **New → GitHub Repo** → este repositório de novo (vira o serviço do cron).
3. Nesse serviço novo:
   - **Variables**: `APP_URL` = `https://${{<serviço do app>.RAILWAY_PUBLIC_DOMAIN}}` e `CRON_SECRET` = `${{<serviço do app>.CRON_SECRET}}`.
   - **Settings → Deploy → Custom Start Command**: `npm run cron -- sync`.
   - **Settings → Cron Schedule**: `0 9 * * *` (UTC; 06:00 em Brasília).
   - Sem domínio público.

O serviço sobe no horário, chama `POST /api/cron/sync` e encerra. Falha aparece como execução com erro no Railway. O botão **Atualizar** na tela Hoje faz a mesma leitura, com intervalo mínimo de 6h.

O build usa Railpack com Node 22 (campo `engines`). `npm start` aplica as migrations antes de subir o servidor. Se faltar variável obrigatória, o processo encerra no boot com a lista do que falta.

## Desenvolvimento

```bash
cp .env.example .env   # preencha DATABASE_URL, AUTH_SECRET, LOGIN_USERNAME e LOGIN_PASSWORD (Pluggy é opcional)
npm install
npm run db:migrate
npm run dev
```
