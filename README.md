# FinControl

PWA pessoal de finanças (PF + PJ/MEI). Stack, convenções e design system em [`CLAUDE.md`](CLAUDE.md).

## Deploy no Railway

1. **New Project → Deploy from GitHub repo** → este repositório.
2. No mesmo projeto: **New → Database → PostgreSQL**.
3. No serviço do app, em **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET` = saída de `openssl rand -base64 48`
4. **Settings → Networking → Generate Domain**. Recomendado: **Settings → Deploy → Healthcheck Path** = `/api/health`.
5. Crie seu usuário dentro do container (o QR do 2FA aparece no terminal):
   ```bash
   railway link
   railway ssh
   npm run user:create
   ```

O build usa Railpack com Node 22 (campo `engines`). `npm start` aplica as migrations antes de subir o servidor. Se faltar variável obrigatória, o processo encerra no boot com a lista do que falta.

## Desenvolvimento

```bash
cp .env.example .env   # preencha DATABASE_URL e AUTH_SECRET
npm install
npm run db:migrate
npm run user:create
npm run dev
```
