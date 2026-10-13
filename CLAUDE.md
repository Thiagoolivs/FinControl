# FinControl

PWA pessoal de finanças (PF + PJ/MEI) alimentado por Open Finance (Pluggy), com IA (Gemini) como guia. Uso de uma pessoa só, modelo pronto para várias.

@AGENTS.md

## Stack

- **Next.js 16** (App Router, TypeScript estrito). `proxy.ts` substitui `middleware.ts`; `cookies()`/`headers()` são assíncronos. A documentação da versão instalada está em `node_modules/next/dist/docs/` — leia antes de usar API nova.
- **PostgreSQL** (Railway) + **Prisma 7**: config em `prisma.config.ts`, client gerado em `generated/prisma` (não versionado), driver adapter `@prisma/adapter-pg`.
- **Tailwind CSS 4** + design system próprio (tokens abaixo).
- **Auth própria**: usuário e senha (Argon2id) definidos em `LOGIN_USERNAME`/`LOGIN_PASSWORD` e sincronizados no boot; TOTP obrigatório, cadastrado no primeiro login (`/login/2fa/configurar`); sessão em cookie httpOnly (tabela `Session`, token só como hash).
- Fases futuras: Pluggy, Gemini (`@google/generative-ai`, function calling), brapi.dev, SGS/BCB, `web-push`.
- **Vitest** para testes. **Railway** (Railpack) para deploy; jobs pelo Railway Cron chamando route handlers protegidos por `CRON_SECRET`.

## Comandos

```bash
npm run dev                          # desenvolvimento
npm run build && npm start           # produção (start roda prisma migrate deploy antes)
npm run lint && npm run typecheck && npm test
npm run db:migrate -- --name <nome>  # nova migration
npm run user:create                  # alternativa: usuário por e-mail com TOTP pelo terminal
```

Deploy no Railway: passo a passo no `README.md`. `instrumentation.ts` valida as variáveis no boot (encerra o processo se faltar alguma) e sincroniza o usuário de `LOGIN_USERNAME`.

## Estrutura

```
app/              rotas (App Router); textos de UI em pt-BR
  (app)/          telas autenticadas com tab bar (Hoje, Config, …); actions.ts = server actions de conexão e sync
  api/            route handlers (health, cron/*)
  dev/components/ catálogo do design system com todos os estados (dados fictícios em fixtures.ts)
components/ui/    design system: um arquivo por componente; estado de dados via ViewStatus
lib/
  auth/           senha, TOTP, sessão, criptografia
  finance/        todo cálculo financeiro — sempre com teste ao lado (*.test.ts)
  pluggy/         cliente HTTP (fetch + zod) e normalize.ts (vocabulário da Pluggy → nosso; puro, testado)
  sync/           leitura das conexões: ingestão, pareamento de transferências, alertas de conexão
  queries/        consultas das telas; scope.ts = filtro PF/PJ/consolidado
  dates.ts        datas de calendário em America/Sao_Paulo
  preferences.ts  cookie de "ocultar valores" (o estado vive em components/ui/hide-values.tsx)
  categorization/ puro e testado: limpeza de descrição, matcher (sem acento), motor de regras, agrupamento da fila, categorias padrão
  rules/          server-only: aplicar regras, fila de revisão, sugestões da IA, mutações de regra/categoria
  streams/        server-only: configuração inicial (streams, buckets, DAS), razão dos buckets, mutações e consultas
  goals/          server-only: metas iniciais, progresso (cache + GoalSnapshot do mês), aportes
  projection/     server-only: detecção das séries recorrentes (RecurringSeries) e montagem da projeção com premissas
  alerts/         catalog.ts (tipos, padrões, parâmetros, tela de cada alerta; puro), regras, avaliação no fim do sync, central
  push/           envio Web Push (web-push + VAPID), remoção de inscrição 404/410
  market/         brapi (cotação, 1 ativo por requisição, cache Quote 12h) e SGS/BCB (CDI, Selic, IPCA); só no cron ou em ação do servidor
  portfolio/      posições com valor de hoje, alocação × alvo, foto diária (PortfolioSnapshot), rentabilidade × CDI, posições manuais
  ai/             cliente do Gemini (fetch + zod; JSON validado e function calling), tools de leitura do chat, system prompt (puro, testado), laço do chat
  charts/         escalas de gráfico
  security/       rate limit
  db.ts           Prisma client
  env.ts          variáveis de ambiente validadas (zod)
prisma/           schema.prisma + migrations
public/           sw.js (service worker), offline.html, icons/ (fonte em icons/icon.svg; PNGs gerados dela)
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
- Aporte mensal de meta: arredondado para cima em reais inteiros (`lib/finance/goals.ts`), calculado no começo do mês a partir do histórico de aportes (meses de aporte contam o corrente). Atrasada = esse valor subiu dois meses seguidos, ou o prazo venceu. Aporte no dia da criação é saldo inicial. Ritmo = média dos últimos 3 meses fechados, sem o mês de criação.
- Projeção (`lib/finance/projection.ts`): parte do disponível menos a fatura em aberto (limite usado − parcelas futuras). Entram só premissas visíveis: recorrentes (±10%, intervalo regular, 3+ ocorrências; receita sem as reservas da stream), parcelas futuras, média de 3 meses fechados dos gastos variáveis, aportes das metas e obrigações fixas. Projeto avulso só na faixa otimista; negócio em linha separada; retirada não é projetada.
- Pluggy: `balance` não traz aplicação automática nem caixinhas; a ingestão grava à parte. `automaticallyInvestedBalance` é o saldo disponível **já somado** ao aplicado (Open Finance): só a diferença para o `balance` entra (`toBankExtras`), senão o saldo dobra. Caixinhas = `reservedBalances`. Conta bancária mantém o sinal; cartão vem com compra positiva e é invertido na ingestão. Dedup por `pluggyTransactionId`; PENDING que some da janela lida é removida.
- Transferência = par saída/entrada de mesmo valor em contas diferentes, até 3 dias (`lib/finance/transfers.ts`); as duas pernas apontam uma para a outra (`transferPeerId`) e recebem a categoria de sistema `TRANSFERENCIA`. Saída de cartão nunca é perna.
- Categorização: depois de cada sync, pareamento de transferências e então regras no que sobrou sem categoria. A primeira regra (menor prioridade; empate = mais antiga) que casa com a descrição limpa ou a original decide. O que foi categorizado por regra é sempre o que as regras dizem agora (editar/desligar/reordenar refaz); categoria escolhida à mão nunca é tocada.
- Fila de revisão = saídas sem categoria e entradas sem stream nem categoria; sem transferência, não ignoradas, agrupadas por `groupKey`, só dentro da janela do usuário (`User.reviewWindowDays`, padrão 60 dias; null = tudo). A janela vale para o badge e para as sugestões da IA.
- Receita: entrada recebe **stream** (`revenueStreamId`), não categoria; entrada com categoria não é receita. Categoria `RECEITA` (árvore Entradas: reembolso, rendimento, presente, venda…) é entrada que não é de stream: só vale para entrada, e regra com ela é sempre `ENTRADA`. Entrada com categoria de gasto é estorno e abate a área. Regra de saída precisa de categoria; o bucket da regra é só "pago com".
- Buckets: `balanceCents` é cache de Σ `BucketEntry` (`refreshBucketBalances`). Entrada com stream gera `ALOCACAO` pelos % da stream (`splitIncome`: reservas arredondadas no meio centavo, o resto fecha a soma); em stream `VENTURE` o resto vai para o caixa do negócio até uma `RETIRADA`. Saída paga com bucket = `PAGAMENTO`. Ajuste manual = `AJUSTE` com a diferença.
- Saldo nas contas = `balance` da Pluggy + aplicação automática + caixinhas (`bankData`, em `toBankExtras`). Disponível = saldo das contas − caixinhas − reservas (imposto + custo) − caixa do negócio. `/contas` mostra conta por conta e o porquê de diferir do app do banco.
- DAS = `FixedObligation`: `OBRIGACAO_FIXA` uma vez por competência (único por obrigação + mês), do mês em que foi criada até hoje. O pagamento cai na regra do DAS, que paga com a reserva de imposto.
- IA só sugere (RuleSuggestion pendente); só descrições vão ao Gemini, sem valores. O sync manda um lote (40 grupos); o botão da fila manda até 3 e diz quanto falta. "Aceitar todas" cria as regras das sugestões com categoria; regra idêntica é reaproveitada, nunca duplicada.
- Limpeza de descrição é idempotente e roda de novo no histórico a cada boot (`lib/rules/reclean.ts`): mudar `clean.ts` vale para tudo no próximo deploy. Regra criada de sugestão aceita sem mudança = `IA_CONFIRMADA` e vai para o `AuditLog` com origem `AI`.
- Ler da Pluggy não dispara atualização no banco (o Meu Pluggy atualiza sozinho). O "Atualizar" diz quando o banco foi lido de fato (`item.lastUpdatedAt`) e só trava 6h depois de uma leitura com dado novo; a legenda da Hoje usa a conexão mais desatualizada. Reconectar sempre no modo atualização do item existente; nunca criar item novo para conexão existente. Mesmas contas em duas conexões (`duplicateConnections`: tipo, nome, número, moeda) = banco conectado duas vezes: Hoje e Config avisam, e "Remover conexão" apaga a conexão daqui com contas e transações (o item fica na Pluggy).
- Valores de negócio (DAS, teto do MEI, % de reserva, metas, limites de alerta) são **parametrizáveis** pelo usuário — nunca constantes no código; o seed só cria valores iniciais.
- Fluxo do mês (`lib/finance/month-flow.ts`): entrou = receita de stream, categoria de entrada e entrada sem classificação; estorno abate o tipo; resgate abate o investido; o que volta além do que saiu conta como entrada. "De cada R$ 100" pelo maior resto (sempre soma 100); se saiu mais do que entrou, a base é o que saiu. Placar: meta de sobra do usuário (`User.savingsTargetBps`, padrão 20%), conquista sem base some (não vira falha), sequência = meses fechados seguidos na meta. Frases do mês (`insights.ts`) levam valores como número, renderizados por `Money`.
- Destaque do mês (manchete da Hoje, `pickHighlight`): entre as categorias variáveis (no nível usado, subcategoria quando houver), a maior que cresceu além do limite "acima da média" do usuário sobre o mesmo ponto do mês passado e pesa ao menos ¼ da maior; senão, a maior. Curva de gasto (`spend-curve.ts`) = acumulado dia a dia, estorno abate, nunca abaixo de zero; mês corrente compara com o mês passado até o mesmo dia, mês fechado com o anterior inteiro. Tela de área: `/transacoes/categorias/[id]` (`total`, `sem` ou categoria de gasto).
- Alertas: avaliados no fim de cada sync (`evaluateAlerts`); o mesmo fato nunca vira dois (`dedupeKey` único). Push só das regras com `push` (padrão: severidade alta), um por sync (agrupado por tag), e a notificação abre a tela do alerta. Permissão só pelo botão em Config → Notificações; no iPhone, só com o app instalado. Texto do alerta é gravado pronto; na tela, valores em R$ passam pela máscara de "ocultar valores".
- Carteira: quantidade e custo vêm da Pluggy (conta INVESTMENT por conexão, fora dos totais) ou de posição manual. Ação/FII/cripto valem quantidade × cotação (`quantityTimesCents`, sem float); renda fixa e fundo, o valor informado. A brapi nunca é chamada no render. Rentabilidade no período = ganho descontando aporte/resgate (variação do custo) sobre o valor inicial, contra o CDI composto nos mesmos dias. **O app nunca recomenda compra ou venda**: mostra só o desvio da alocação-alvo do usuário.
- Chat (`lib/ai/chat.ts`): o modelo só chama as tools de `lib/ai/tools.ts`, que devolvem valores já formatados (diferenças e percentuais calculados no TypeScript); a IA explica, não calcula. As partes do modelo voltam intactas na rodada seguinte (assinatura de pensamento). Tool sem `scope` usa o escopo da tela; PF + PJ só com `consolidated: true`. System prompt com as cinco regras do spec, sem valores financeiros. Histórico em `ChatMessage` (tools usadas em `toolCalls`); 40 perguntas por hora.
- Escrita pela IA (`lib/ai/proposals.ts`): as tools `propor*` validam, montam a prévia e gravam só uma `AiProposal` pendente (24h). O card do chat mostra a prévia; Confirmar manda só o id, e o servidor reivindica a proposta uma vez e executa os **args guardados nela**. Cada execução vai para o `AuditLog` com origem `AI` e `proposalId`; se falhar, volta a pendente. "Marcar recorrente" grava a decisão em `RecurringSeries.userStatus` (mesma chave da detecção), que a detecção nunca sobrescreve.
- PWA: `app/manifest.ts`, `app/icon.svg`, `app/apple-icon.png`. O service worker não guarda nenhum dado financeiro: navegação sempre na rede, sem rede mostra `offline.html`. Arquivos que o navegador busca para instalar ficam fora do `proxy.ts`.
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
- Hierarquia por peso e espaço, não por borda. Um número protagonista por tela. Telas longas em `Section` (rótulo em caixa alta + título 28px leve), 64px entre seções.
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
