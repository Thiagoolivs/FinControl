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

### Notificações (Web Push, opcional)

Gere as chaves uma vez com `npx web-push generate-vapid-keys` e defina nas Variables do app `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (ex.: `mailto:voce@exemplo.com`). Depois, no celular, ligue em Config → Notificações. No iPhone, instale o app na tela de início antes (Safari → Compartilhar → Adicionar à Tela de Início) e abra por lá. O que vira notificação se escolhe em Config → Alertas. Trocar as chaves invalida as inscrições: é preciso ligar de novo em cada aparelho.

### Carteira (opcional)

Os investimentos da Pluggy entram sozinhos no sync (se o MeuPluggy tiver). Para o preço de ação, FII e cripto, crie um token gratuito em brapi.dev e defina `BRAPI_TOKEN` nas Variables: o cron busca uma cotação por ativo, uma vez por dia. CDI, Selic e IPCA vêm do Banco Central sem token. Sem a brapi, essas posições ficam com o valor que o banco informa (ou o custo).

### Sync automático (Railway Cron)

1. No app, em Variables: `CRON_SECRET` = saída de `openssl rand -hex 32`.
2. No mesmo projeto: **New → GitHub Repo** → este repositório de novo (vira o serviço do cron).
3. Nesse serviço novo:
   - **Variables**: `APP_URL` = `https://${{<serviço do app>.RAILWAY_PUBLIC_DOMAIN}}` e `CRON_SECRET` = `${{<serviço do app>.CRON_SECRET}}`.
   - **Settings → Deploy → Custom Start Command**: `npm run cron -- sync`.
   - **Settings → Cron Schedule**: `0 */3 * * *` (a cada 3 horas). Ler da Pluggy não gasta cota e o Meu Pluggy atualiza os bancos no horário dele: lendo várias vezes por dia, o app pega a atualização no mesmo dia.
   - Sem domínio público.

O serviço sobe no horário, chama `POST /api/cron/sync` e encerra. Falha aparece como execução com erro no Railway. O botão **Atualizar** na tela Hoje faz a mesma leitura; ele só trava por 6h depois de uma leitura que trouxe dado novo do banco. O app não manda o banco atualizar: para puxar na hora, atualize o banco em meu.pluggy.ai e toque em Atualizar.

O build usa Railpack com Node 22 (campo `engines`). `npm start` aplica as migrations antes de subir o servidor. Se faltar variável obrigatória, o processo encerra no boot com a lista do que falta.

## Desenvolvimento

```bash
cp .env.example .env   # preencha DATABASE_URL, AUTH_SECRET, LOGIN_USERNAME e LOGIN_PASSWORD (Pluggy é opcional)
npm install
npm run db:migrate
npm run dev
```
