"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ActionState } from "../../actions";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "./actions";

const inputClass =
  "h-11 min-w-0 flex-1 rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p>;
  return null;
}

/** Linha de categoria: renomear e apagar no lugar. */
export function CategoryRow({
  id,
  name,
  usage,
  locked,
  nested,
}: {
  id: string;
  name: string;
  usage: { transactions: number; rules: number };
  locked: boolean;
  nested: boolean;
}) {
  const [mode, setMode] = useState<"view" | "actions" | "rename" | "delete">("view");
  const [value, setValue] = useState(name);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const text = nested ? "text-[15px]" : "text-[16px] font-medium";

  if (mode === "rename") {
    return (
      <form
        className="flex flex-col gap-2 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await renameCategoryAction({ id, name: value });
            setState(result);
            if (!result.error) setMode("view");
          });
        }}
      >
        <div className="flex gap-2">
          <input aria-label={`Novo nome para ${name}`} value={value} onChange={(event) => setValue(event.target.value)} autoFocus className={inputClass} />
          <Button type="submit" variant="secondary" className="h-11" loading={pending}>
            Salvar
          </Button>
        </div>
        <Feedback state={state} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={locked}
        aria-expanded={mode !== "view"}
        aria-label={`Editar ${name}`}
        onClick={() => setMode(mode === "view" ? "actions" : "view")}
        className="flex min-h-11 w-full items-center gap-2 text-left text-text-primary disabled:cursor-default"
      >
        <span className={`min-w-0 flex-1 truncate ${text}`}>{name}</span>
        <span className="shrink-0 text-[13px] text-text-secondary">{usage.transactions}</span>
      </button>
      {mode === "actions" ? (
        <div className="flex gap-4 pb-1">
          <Button variant="link" onClick={() => setMode("rename")}>
            Renomear
          </Button>
          <button type="button" onClick={() => setMode("delete")} className="min-h-11 px-1 text-[16px] font-medium text-negative">
            Apagar
          </button>
        </div>
      ) : null}
      {mode === "delete" ? (
        <div className="flex flex-col gap-2 rounded-button bg-surface-elevated px-4 py-3">
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            {usage.transactions > 0 || usage.rules > 0
              ? `${usage.transactions} ${usage.transactions === 1 ? "transação volta" : "transações voltam"} para a fila e ${usage.rules} ${usage.rules === 1 ? "regra é apagada" : "regras são apagadas"}.`
              : "Nenhuma transação usa esta categoria."}
            {!nested ? " As subcategorias vão junto." : ""}
          </p>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="h-11"
              loading={pending}
              onClick={() => startTransition(async () => setState(await deleteCategoryAction(id)))}
            >
              Apagar {name}
            </Button>
            <Button variant="link" onClick={() => setMode("view")} disabled={pending}>
              Cancelar
            </Button>
          </div>
          <Feedback state={state} />
        </div>
      ) : null}
    </div>
  );
}

const KINDS = [
  { value: "VARIAVEL", label: "Variável" },
  { value: "ESSENCIAL", label: "Essencial" },
  { value: "INVESTIMENTO", label: "Investimento" },
  { value: "RECEITA", label: "Entrada" },
] as const;

const ICONS: { value: IconName; label: string }[] = [
  { value: "dots", label: "Genérico" },
  { value: "home", label: "Casa" },
  { value: "cart", label: "Carrinho" },
  { value: "food", label: "Comida" },
  { value: "car", label: "Carro" },
  { value: "heart", label: "Saúde" },
  { value: "book", label: "Livro" },
  { value: "ticket", label: "Ingresso" },
  { value: "bag", label: "Sacola" },
  { value: "repeat", label: "Recorrente" },
  { value: "code", label: "Trabalho" },
  { value: "luggage", label: "Mala" },
  { value: "gift", label: "Presente" },
  { value: "receipt", label: "Recibo" },
  { value: "bolt", label: "Energia" },
  { value: "user", label: "Pessoa" },
  { value: "briefcase", label: "Pasta" },
  { value: "chart", label: "Gráfico" },
  { value: "wallet", label: "Carteira" },
];

/** Nova categoria: de primeiro nível (com tipo e ícone) ou subcategoria (herda da mãe). */
export function NewCategoryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("VARIAVEL");
  const [icon, setIcon] = useState<IconName>("dots");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createCategoryAction({ name, parentId: parentId || null, kind, icon });
          setState(result);
          if (!result.error) setName("");
        });
      }}
    >
      <input aria-label="Nome da nova categoria" placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} h-[50px] w-full flex-none`} />
      <label className="relative flex">
        <span className="sr-only">Dentro de</span>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)} className={`${inputClass} h-[50px] w-full flex-none appearance-none pr-10`}>
          <option value="">Primeiro nível</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              Dentro de {parent.name}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </label>
      {parentId === "" ? (
        <>
          <SegmentedControl variant="boxed" label="Tipo" options={KINDS} value={kind} onChange={setKind} />
          <label className="relative flex">
            <span className="sr-only">Ícone</span>
            <select value={icon} onChange={(event) => setIcon(event.target.value as IconName)} className={`${inputClass} h-[50px] w-full flex-none appearance-none pl-11 pr-10`}>
              {ICONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Icon name={icon} size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
            <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
          </label>
        </>
      ) : null}
      <Button type="submit" variant="secondary" loading={pending} disabled={!name.trim()}>
        Criar categoria
      </Button>
      <Feedback state={state} />
    </form>
  );
}
