"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChatBubble, ChatButton, ChatComposer, ChatSheet } from "@/components/ui/chat-sheet";
import { useValuesHidden } from "@/components/ui/hide-values";
import { type ChatMessageView, clearChatAction, loadChatAction, sendChatAction } from "./chat-actions";

const MONEY = /[−-]?R\$\s?\d[\d.]*(?:,\d{2})?/g;

const SUGGESTIONS = ["Quanto posso gastar hoje?", "Onde gastei mais este mês?", "Como estão minhas metas?", "Compare este mês com o passado"];

/** Texto do modelo: parágrafos e listas simples; valores em R$ respeitam "ocultar valores". */
function ModelText({ text }: { text: string }) {
  const hidden = useValuesHidden();
  const shown = hidden ? text.replace(MONEY, "R$ ••••") : text;
  return (
    <>
      {shown.split(/\n{2,}/).map((block, index) => (
        <p key={index} className="m-0 whitespace-pre-line">
          {block.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[-*]\s+/gm, "• ")}
        </p>
      ))}
    </>
  );
}

/** Botão flutuante e o chat. Abre em qualquer tela; a pergunta leva o escopo da tela (PF, PJ ou tudo). */
export function Chat() {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  function openChat() {
    setOpen(true);
    if (messages === null) {
      startTransition(async () => {
        const loaded = await loadChatAction();
        setConfigured(loaded.configured);
        setMessages(loaded.messages);
      });
    }
  }

  function send(text: string) {
    setError(null);
    const optimistic: ChatMessageView = { id: `local-${Date.now()}`, role: "user", text, tools: [] };
    setMessages((current) => [...(current ?? []), optimistic]);
    startTransition(async () => {
      const result = await sendChatAction({ text, escopo: params.get("escopo") });
      if (result.error) {
        setError(result.error);
        return;
      }
      const reply = result.message;
      if (reply) setMessages((current) => [...(current ?? []), reply]);
    });
  }

  return (
    <>
      {open ? null : <ChatButton onClick={openChat} />}
      <ChatSheet
        open={open}
        onOpenChange={setOpen}
        title="Perguntar"
        composer={configured ? <ChatComposer onSend={send} disabled={pending} /> : null}
      >
        {!configured ? (
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            Chat desligado. Defina <code>GEMINI_API_KEY</code> e <code>GEMINI_MODEL</code> nas variáveis do Railway.
          </p>
        ) : messages === null ? (
          <p className="m-0 text-[15px] text-text-secondary">Carregando…</p>
        ) : (
          <>
            {messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
                  Pergunte sobre seu dinheiro. Os números vêm do app; a IA só explica. O que você escreve e os dados que ela consulta passam
                  pela API do Gemini (Google).
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="min-h-11 rounded-full bg-surface-elevated px-4 text-[14px] text-text-primary"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((message) => (
              <ChatBubble key={message.id} role={message.role}>
                {message.role === "model" ? <ModelText text={message.text} /> : message.text}
              </ChatBubble>
            ))}
            {pending ? (
              <p role="status" className="m-0 text-[13px] text-text-secondary">
                Consultando seus números…
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="m-0 text-[13px] text-negative">
                {error}
              </p>
            ) : null}
            {messages.length > 0 && !pending ? (
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await clearChatAction();
                    setMessages([]);
                  })
                }
                className="min-h-11 self-center text-[13px] text-text-secondary"
              >
                Apagar conversa
              </button>
            ) : null}
            <div ref={end} />
          </>
        )}
      </ChatSheet>
    </>
  );
}
