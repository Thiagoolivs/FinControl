"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RuleEditor } from "@/components/ui/rule-editor";
import type { RuleDraft } from "@/lib/categorization/rule-draft";
import { deleteRuleAction, saveRuleAction } from "./actions";

type Option = { id: string; name: string };

export function RuleForm({
  ruleId,
  categories,
  initialValue,
  sampleDescription,
}: {
  ruleId: string | null;
  categories: Option[];
  initialValue?: Partial<RuleDraft>;
  sampleDescription?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();

  async function submit(draft: RuleDraft) {
    const result = await saveRuleAction({
      id: ruleId,
      pattern: draft.pattern,
      matchType: draft.matchType,
      direction: draft.direction,
      scope: draft.scope,
      categoryId: draft.categoryId,
      priority: draft.priority,
      applyRetroactively: draft.applyRetroactively,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/config/regras");
  }

  return (
    <RuleEditor
      categories={categories}
      streams={[]}
      buckets={[]}
      initialValue={initialValue}
      sampleDescription={sampleDescription}
      submitError={error}
      showRetroactive={ruleId === null}
      onSubmit={submit}
      onCancel={() => router.push("/config/regras")}
    />
  );
}

export function DeleteRule({ ruleId, hitCount }: { ruleId: string; hitCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [returnToQueue, setReturnToQueue] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Apagar regra
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface px-5 py-4">
      <p className="m-0 text-[15px] font-semibold">Apagar esta regra?</p>
      {hitCount > 0 ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-[13px] text-text-secondary">
            Ela categoriza {hitCount} {hitCount === 1 ? "transação" : "transações"} hoje.
          </legend>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="destino" checked={!returnToQueue} onChange={() => setReturnToQueue(false)} />
            Manter a categoria nelas
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="destino" checked={returnToQueue} onChange={() => setReturnToQueue(true)} />
            Devolver para a fila (outras regras podem pegar)
          </label>
        </fieldset>
      ) : null}
      <div className="flex gap-3">
        <Button
          variant="destructive"
          className="flex-1"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteRuleAction({ id: ruleId, returnToQueue });
              if (result.error) setError(result.error);
              else router.push("/config/regras");
            })
          }
        >
          Apagar
        </Button>
        <Button variant="link" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] text-negative">{error}</p> : null}
    </div>
  );
}
