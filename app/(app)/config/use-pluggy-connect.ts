"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { type ActionState, connectTokenAction, registerConnectionAction } from "../actions";

const itemShape = z.object({ id: z.string() });

/**
 * Abre o widget Pluggy Connect. Com `connectionId`, abre no modo de atualizar o item existente:
 * reconectar nunca cria item novo (criar de novo queima a cota do CPF/CNPJ na Pluggy).
 */
export function usePluggyConnect({ connectionId, scope }: { connectionId?: string; scope: "PF" | "PJ" }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState & { phase?: "abrindo" | "aberto" | "lendo" }>({});

  async function open() {
    setState({ phase: "abrindo" });
    const token = await connectTokenAction(connectionId);
    if ("error" in token) {
      setState({ error: token.error });
      return;
    }
    const { PluggyConnect } = await import("pluggy-connect-sdk");
    const light = document.documentElement.dataset.theme === "light";
    let finished = false;
    const widget = new PluggyConnect({
      connectToken: token.token,
      updateItem: token.updateItem,
      language: "pt",
      theme: light ? "light" : "dark",
      onOpen: () => setState({ phase: "aberto" }),
      onSuccess: async ({ item }) => {
        finished = true;
        const parsed = itemShape.safeParse(item);
        if (!parsed.success) {
          setState({ error: "A Pluggy não devolveu o item conectado." });
          return;
        }
        setState({ phase: "lendo" });
        const result = await registerConnectionAction({ itemId: parsed.data.id, scope });
        setState(result);
        router.refresh();
      },
      onError: ({ message }) => {
        finished = true;
        setState({ error: `A conexão não foi concluída: ${message}` });
      },
      onClose: () => {
        if (!finished) setState({});
      },
    });
    try {
      await widget.init();
    } catch {
      setState({ error: "Não foi possível abrir o widget da Pluggy." });
    }
  }

  const busy = state.phase !== undefined;
  return { open, busy, state };
}
