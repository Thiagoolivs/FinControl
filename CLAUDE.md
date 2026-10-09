# FinControl

PWA pessoal de finanças (PF + PJ/MEI) alimentado por Open Finance (Pluggy), com IA (Gemini) como guia. Uso de uma pessoa só, modelo pronto para várias.

@AGENTS.md

## Stack

- **Next.js 16** (App Router, TypeScript estrito). `proxy.ts` substitui `middleware.ts`; `cookies()`/`headers()` são assíncronos. A documentação da versão instalada está em `node_modules/next/dist/docs/` — leia antes de usar API nova.
- **PostgreSQL** (Railway) + **Prisma 7**: config em `prisma.config.ts`, client gerado em `generated/prisma` (não versionado), driver adapter `@prisma/adapter-pg`.
- **Tailwind CSS 4** + design system próprio (tokens abaixo).
- **Auth própria**: Argon2id + TOTP obrigatório + sessão em cookie httpOnly (tabela `Session`, token só como hash).
- Fases futuras: Pluggy, Gemini (`@google/generative-ai`, function calling), brapi.dev, SGS/BCB, `web-push`.
- **Vitest** para testes. **Railway** (Railpack) para deploy; jobs pelo Railway Cron chamando route handlers protegidos por `CRON_SECRET`.

## Comandos

```bash
npm run dev                          # desenvolvimento
npm run build && npm start           # produção (start roda prisma migrate deploy antes)
npm run lint && npm run typecheck && npm test
npm run db:migrate -- --name <nome>  # nova migration
npm run user:create                  # cria usuário + ativa TOTP (interativo)
```

Deploy no Railway: passo a passo no `README.md`. `instrumentation.ts` valida as variáveis no boot e encerra o processo se faltar alguma.

## Estrutura

```
app/              rotas (App Router); textos de UI em pt-BR
  api/            route handlers (health, cron/*)
lib/
  auth/           senha, TOTP, sessão, criptografia
  finance/        todo cálculo financeiro — sempre com teste ao lado (*.test.ts)
  security/       rate limit
  db.ts           Prisma client
  env.ts          variáveis de ambiente validadas (zod)
prisma/           schema.prisma + migrations
scripts/          CLIs executados com tsx
proxy.ts          checagem otimista de sessão (a validação real é no servidor)
```

## Convenções

- Identificadores de código e banco em **inglês**; texto de UI em **pt-BR**. Valores de enum de domínio em português sem acento, como no spec (`VARIAVEL`, `TRANSFERENCIA`); enums que espelham API externa ficam no idioma dela (`LOGIN_ERROR`).
- **Dinheiro: `Int` em centavos**, sufixo `Cents`. Nunca float. Percentual em basis points, sufixo `Bps` (12% = 1200).
- `Transaction.amountCents`: negativo = saída, positivo = entrada.
- Campos `@db.Date` são datas locais em America/Sao_Paulo.
- Toda query filtra por `userId` na própria query (coluna direta). Nunca no cliente.
- Nenhuma query soma PF e PJ sem o chamador passar `consolidated: true`.
- Transferência entre contas próprias e pagamento de fatura não são despesa.
- Valores de negócio (DAS, teto do MEI, % de reserva, metas, limites de alerta) são **parametrizáveis** pelo usuário — nunca constantes no código; o seed só cria valores iniciais.
- Segredos só no servidor. Nada de `NEXT_PUBLIC_`, exceto a chave VAPID pública.
- Módulos que tocam sessão ou dados importam `server-only`. Módulos puros (`lib/auth/password.ts`, `totp.ts`, `crypto.ts`, `lib/finance/*`) não, para os scripts conseguirem usá-los.
- Server Actions e route handlers revalidam a sessão por conta própria; o `proxy.ts` é só um atalho de redirecionamento.

## Design system

Direção aprovada: **B · Ledger** (Inter; tipografia como estrutura; quase sem cards; número protagonista em peso 300 com centavos menores e em cinza; rótulos 12px em caixa alta com tracking) **+ a barra de composição do saldo da direção C** (Disponível / Reservado / Caixa do negócio, legenda clicável abaixo). Referência visual: https://claude.ai/artifact/VAQj8foC1yBVS7JRJtADUQ

| Token | Dark | Uso |
|---|---|---|
| `--bg` | `#0A0A0B` | fundo |
| `--surface` | `#141416` | superfície |
| `--surface-elevated` | `#1C1C1F` | superfície elevada |
| `--border` | `rgba(255,255,255,0.06)` | quase nunca |
| `--text-primary` | `#F5F5F7` | texto |
| `--text-secondary` | `#8E8E93` | texto secundário |
| `--text-tertiary` | `#5A5A5F` | **só decorativo** (2,8:1, não passa contraste de texto) |
| `--accent` | `#0A84FF` | ação, links, foco |
| `--accent-fill` | `#0066DD` | fundo de botão com texto branco (`--accent` dá 3,6:1) |
| `--positive` | `#30D158` | entrada, meta no prazo |
| `--negative` | `#FF453A` | saída acima do previsto, meta atrasada |
| `--warning` | `#FF9F0A` | atenção |
| `--scope-pj` | `#BF5AF2` | identidade da PJ — toda superfície PJ carrega essa cor |
| `--badge` | `#D70015` | contador da tab bar (branco sobre `--negative` dá 3,4:1) |

Variante light definida em `app/globals.css`.

- **Cor só com significado.** Categorias se distinguem por ícone e rótulo; barras de categoria em cinza neutro; laranja só para "acima da média". Saída normal em texto primário, entrada em verde com `+`, transferência em cinza.
- Hierarquia por peso e espaço, não por borda. Um número protagonista por tela.
- Números sempre `tabular-nums`.
- Movimento 200–300ms, `cubic-bezier(0.32, 0.72, 0, 1)`, sem bounce.
- Raio: 16px cards, 12px botões, 999px pills. Padding 20px em cards, gap 12px em listas.
- Mobile-first em 390px; toque ≥ 44px; `safe-area-inset` respeitado. Desktop: mesma estrutura em coluna central ≤ 720px com navegação lateral.
- Tab bar (4): **Hoje** (badge de alertas) · **Transações** (badge da fila de revisão) · **Metas** · **Projeção**. Carteira e Config pelo avatar no topo. Chat por botão flutuante.

## Regras de trabalho

- Sem preâmbulo e sem resumo do que acabou de fazer. Código e, no máximo, duas linhas sobre decisões não óbvias.
- Edições localizadas. Nunca reescrever um arquivo inteiro para mudar três linhas.
- Uma fase por vez; não avançar de fase sem aprovação.
- Perguntar quando a decisão for do usuário; decidir sozinho quando houver padrão óbvio e dizer qual em uma linha.
- Commits pequenos, mensagem em português no imperativo.
- TypeScript estrito. Sem `any`. Sem `@ts-ignore`.
- Toda função de cálculo financeiro em `lib/finance/` com teste unitário. Cálculo errado aqui é dinheiro errado.
- Valores monetários em centavos, como inteiro. Nunca float.
