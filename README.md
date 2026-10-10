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

O build usa Railpack com Node 22 (campo `engines`). `npm start` aplica as migrations antes de subir o servidor. Se faltar variável obrigatória, o processo encerra no boot com a lista do que falta.

## Desenvolvimento

```bash
cp .env.example .env   # preencha DATABASE_URL, AUTH_SECRET, LOGIN_USERNAME e LOGIN_PASSWORD
npm install
npm run db:migrate
npm run dev
```
