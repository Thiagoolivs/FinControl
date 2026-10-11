import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ALERT_CATALOG } from "@/lib/alerts/catalog";
import { getAlertRules } from "@/lib/alerts/rules";
import { requireUser } from "@/lib/auth/dal";
import { PAGE_CLASS } from "../../page-header";
import { AlertRuleRow } from "./rule-row";

export default async function AlertRulesPage() {
  const user = await requireUser();
  const rules = await getAlertRules(user.id);
  return (
    <main className={PAGE_CLASS}>
      <Link href="/config" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Config
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Alertas</h1>
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Avaliados no fim de cada leitura dos bancos. Todos aparecem na central e no badge da Hoje; os com notificação também
          chegam no celular.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rules.map((rule) => {
          const spec = ALERT_CATALOG[rule.type];
          return (
            <li key={rule.id}>
              <AlertRuleRow rule={rule} label={spec.label} description={spec.description} specs={spec.params} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
