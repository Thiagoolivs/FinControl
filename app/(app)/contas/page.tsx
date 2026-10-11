import Link from "next/link";
import type { ReactNode } from "react";
import { BalanceHero } from "@/components/ui/balance-hero";
import { Money } from "@/components/ui/money";
import { StatRow } from "@/components/ui/stat-row";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, formatMoment } from "@/lib/dates";
import { summarizeBalances } from "@/lib/finance/balance";
import { getAccounts, getConnections, savedBoxesOf } from "@/lib/queries/overview";
import { parseScopeParam } from "@/lib/queries/scope";
import { manualRefreshAvailableAt } from "@/lib/sync/sync";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { RefreshButton } from "../refresh-button";
import { ScopeFilter } from "../scope-filter";
import { InTotalsSwitch } from "./in-totals-switch";

const ACCOUNT_KIND = { CHECKING: "Conta corrente", SAVINGS: "Poupança", CREDIT: "Cartão", INVESTMENT: "Investimento" } as const;

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

export default async function AccountsPage({ searchParams }: PageProps<"/contas">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const [accounts, connections, refreshAt] = await Promise.all([getAccounts(user.id, query), getConnections(user.id), manualRefreshAvailableAt(user.id)]);

  const cash = accounts.filter((account) => account.type === "CHECKING" || account.type === "SAVINGS");
  const cards = accounts.filter((account) => account.type === "CREDIT");
  const balance = summarizeBalances(accounts);
  const bankSaysCents = cash.filter((account) => account.includeInTotals && account.currency === "BRL").reduce((sum, account) => sum + account.balanceCents, 0);
  const freshest = connections.reduce<Date | null>((latest, connection) => (connection.lastSyncAt && (!latest || connection.lastSyncAt > latest) ? connection.lastSyncAt : latest), null);

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Contas" trailing={connections.length > 0 ? <RefreshButton blockedUntilLabel={refreshAt ? formatMoment(refreshAt) : null} /> : null} />
      {connections.length > 0 ? <ScopeFilter value={scopeValue} /> : null}

      <BalanceHero
        label="Saldo nas contas"
        amountCents={balance.grossCents}
        scope={scopeValue}
        status={cash.length === 0 ? "empty" : "ready"}
        caption={freshest ? `Lido do banco ${formatElapsed(freshest)}` : undefined}
        emptyTitle="Nenhuma conta corrente ou poupança."
        emptyDescription="Conecte um banco em Config para ver o saldo aqui."
        composition={
          balance.autoInvestedCents > 0 || balance.savedCents > 0 ? (
            <div className="mt-2 flex flex-col">
              <StatRow label="Saldo que o banco informa" valueCents={bankSaysCents} />
              {balance.autoInvestedCents > 0 ? (
                <StatRow label="Aplicação automática" valueCents={balance.autoInvestedCents} hint="O banco resgata sozinho quando precisa: conta como disponível." />
              ) : null}
              {balance.savedCents > 0 ? (
                <StatRow label="Guardado em caixinhas" valueCents={balance.savedCents} hint="Dinheiro separado por você: fica fora do disponível." />
              ) : null}
            </div>
          ) : undefined
        }
      />

      {cash.length > 0 ? (
        <section aria-labelledby="contas-correntes" className="flex flex-col gap-6">
          <Eyebrow as="h2" id="contas-correntes">
            Conta por conta
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col gap-8 p-0">
            {cash.map((account) => (
              <CashAccount key={account.id} account={account} />
            ))}
          </ul>
        </section>
      ) : null}

      {cards.length > 0 ? (
        <section aria-labelledby="cartoes" className="flex flex-col gap-6">
          <Eyebrow as="h2" id="cartoes">
            Cartões
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col gap-8 p-0">
            {cards.map((account) => (
              <li key={account.id} className="flex flex-col gap-1">
                <AccountTitle account={account} amountCents={account.balanceCents} />
                <dl className="m-0 flex flex-col">
                  <Detail label="Limite usado" cents={account.balanceCents} />
                  {account.creditLimitCents !== null ? <Detail label="Limite total" cents={account.creditLimitCents} /> : null}
                  {account.availableCreditCents !== null ? <Detail label="Limite disponível" cents={account.availableCreditCents} /> : null}
                </dl>
                <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
                  Inclui parcelas futuras. Cartão não entra no saldo: é o que você vai pagar nas faturas.
                </p>
                <InTotalsSwitch accountId={account.id} include={account.includeInTotals} label="Somar no limite usado da tela Hoje" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="diferenca" className="flex flex-col gap-4 pb-6">
        <Eyebrow as="h2" id="diferenca">
          Diferente do app do banco?
        </Eyebrow>
        <ol className="m-0 flex list-none flex-col gap-4 p-0 text-[15px] leading-[22px]">
          <Reason title="O banco foi lido em outro momento">
            O Open Finance entrega o saldo da hora em que o banco foi lido{freshest ? ` (${formatElapsed(freshest)})` : ""}. Toque em Atualizar no topo; o banco leva
            alguns minutos para responder. Lançamentos de hoje podem só aparecer na leitura seguinte.
          </Reason>
          <Reason title="Caixinhas e aplicação automática">
            Já somamos acima quando o banco informa. Se o seu banco não manda esses valores pelo Open Finance, eles não aparecem aqui.
          </Reason>
          <Reason title="Investimentos ficam na Carteira">
            CDB, Tesouro, fundos e ações não entram no saldo das contas. Veja em{" "}
            <Link href="/carteira" className="text-accent">
              Carteira
            </Link>
            .
          </Reason>
          <Reason title="Filtro PF / PJ">Com PF ou PJ escolhido no topo, as contas do outro lado ficam de fora. Escolha Tudo para ver todas.</Reason>
          <Reason title="Disponível não é o saldo">
            O número grande da tela Hoje é o disponível: saldo das contas menos caixinhas, reservas de imposto e custo e o caixa do negócio.
          </Reason>
          <Reason title="Conta que não deveria contar">Desligue &quot;Somar no saldo&quot; na conta (ex.: conta conjunta, conta antiga).</Reason>
        </ol>
        {connections.length === 0 ? (
          <Link href="/config" className="flex min-h-11 items-center self-start text-[15px] text-accent">
            Conectar banco
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function AccountTitle({ account, amountCents }: { account: AccountRow; amountCents: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2 text-[17px] font-medium">
          <span className="truncate">{account.name}</span>
          <ScopeTag scope={account.scope} />
        </span>
        <span className="truncate text-[13px] text-text-secondary">
          {[account.connection?.institutionName, ACCOUNT_KIND[account.type], account.number].filter(Boolean).join(" · ")}
        </span>
      </div>
      <Money cents={amountCents} className={amountCents < 0 ? "text-[20px] font-light text-negative" : "text-[20px] font-light"} />
    </div>
  );
}

function CashAccount({ account }: { account: AccountRow }) {
  const boxes = savedBoxesOf(account.savedBoxes);
  const total = account.balanceCents + account.autoInvestedCents + account.savedCents;
  const showClosing = account.closingBalanceCents !== null && account.closingBalanceCents !== account.balanceCents;
  return (
    <li id={account.id} className="flex flex-col gap-1">
      <AccountTitle account={account} amountCents={total} />
      <dl className="m-0 mt-2 flex flex-col">
        <Detail label="Saldo que o banco informa" cents={account.balanceCents} />
        {account.autoInvestedCents !== 0 ? <Detail label="Aplicação automática" cents={account.autoInvestedCents} /> : null}
        {boxes.map((box) => (
          <Detail key={box.name} label={box.name} cents={box.cents} hint="caixinha" />
        ))}
        {account.overdraftLimitCents ? (
          <>
            <Detail label="Cheque especial em uso" cents={account.overdraftUsedCents ?? 0} />
            <Detail label="Limite do cheque especial" cents={account.overdraftLimitCents} />
          </>
        ) : null}
      </dl>
      {showClosing && account.closingBalanceCents !== null ? (
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          O banco também informa um saldo disponível de <Money cents={account.closingBalanceCents} />. Aqui usamos o saldo atual.
        </p>
      ) : null}
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        {account.connection?.lastSyncAt ? `Lido do banco ${formatElapsed(account.connection.lastSyncAt)}.` : "Ainda não lida."}
        {account.currency !== "BRL" ? ` Em ${account.currency}: fica fora do total.` : ""}
      </p>
      <InTotalsSwitch accountId={account.id} include={account.includeInTotals} label="Somar no saldo" />
    </li>
  );
}

function Detail({ label, cents, hint }: { label: string; cents: number; hint?: string }) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <dt className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-[15px] text-text-secondary">
        <span className="break-words">{label}</span>
        {hint ? <span className="text-[13px]">{hint}</span> : null}
      </dt>
      <dd className="m-0">
        <Money cents={cents} className={cents < 0 ? "text-[15px] text-negative" : "text-[15px]"} />
      </dd>
    </div>
  );
}

function Reason({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="font-medium">{title}</span>
      <span className="text-text-secondary">{children}</span>
    </li>
  );
}
