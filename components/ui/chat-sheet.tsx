"use client";

import { type FormEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

type Detent = "medium" | "large";

const DETENT_HEIGHT: Record<Detent, number> = { medium: 55, large: 92 };
const CLOSE_MS = 300;
// Arrasto mínimo (px) ou velocidade (px/ms) para trocar de altura ou fechar.
const DRAG_THRESHOLD = 64;
const FLING_VELOCITY = 0.5;

type ChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  composer?: ReactNode;
  initialDetent?: Detent;
};

/** Bottom sheet com duas alturas, arrastável pela alça. Esc ou toque fora fecha. */
export function ChatSheet({ open, onOpenChange, title = "Perguntar", children, composer, initialDetent = "medium" }: ChatSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const [detent, setDetent] = useState<Detent>(initialDetent);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    setClosing(true);
    window.setTimeout(() => {
      onOpenChange(false);
      setClosing(false);
      setDetent(initialDetent);
      setDragY(0);
    }, CLOSE_MS);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { y: event.clientY, time: performance.now() };
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const delta = event.clientY - dragStart.current.y;
    // Acima da altura máxima o arrasto resiste, como no iOS.
    setDragY(detent === "large" && delta < 0 ? delta / 4 : delta);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    if (!start) return;
    const delta = event.clientY - start.y;
    const velocity = delta / Math.max(1, performance.now() - start.time);
    setDragY(0);
    const up = delta < -DRAG_THRESHOLD || velocity < -FLING_VELOCITY;
    const down = delta > DRAG_THRESHOLD || velocity > FLING_VELOCITY;
    if (up) setDetent("large");
    else if (down && detent === "large" && delta < window.innerHeight * 0.45) setDetent("medium");
    else if (down) requestClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      style={{ height: `calc(${DETENT_HEIGHT[detent]}dvh - ${dragY}px)` }}
      className={cn(
        "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto hidden max-h-none w-full max-w-[720px] flex-col overflow-hidden rounded-t-[20px] border-0 bg-surface p-0 text-text-primary open:flex backdrop:bg-black/50",
        "transition-[height,transform] duration-300 ease-apple starting:translate-y-full",
        dragging && "transition-none",
        closing && "translate-y-full",
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="shrink-0 cursor-grab touch-none select-none px-5 pb-2 pt-2.5 active:cursor-grabbing"
      >
        <div aria-hidden="true" className="mx-auto h-[5px] w-9 rounded-full bg-text-tertiary" />
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[17px] font-semibold">
            <Icon name="sparkle" size={18} className="text-accent" />
            {title}
          </span>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fechar"
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-text-secondary"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>
      {composer ? <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">{composer}</div> : null}
    </dialog>
  );
}

export function ChatBubble({ role, children }: { role: "user" | "model"; children: ReactNode }) {
  return role === "user" ? (
    <div className="max-w-[85%] self-end rounded-[18px] bg-surface-elevated px-4 py-2.5 text-[15px] leading-[21px]">{children}</div>
  ) : (
    <div className="flex max-w-full flex-col gap-3 self-start text-[15px] leading-[22px]">{children}</div>
  );
}

export function ChatComposer({ onSend, disabled = false }: { onSend?: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    onSend?.(message);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-full bg-surface-elevated py-1 pl-4 pr-1">
      <label htmlFor="chat-input" className="sr-only">
        Mensagem
      </label>
      <input
        id="chat-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        placeholder="Pergunte sobre seu dinheiro"
        autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-secondary"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="Enviar"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white transition-opacity duration-200 ease-apple disabled:opacity-40"
      >
        <Icon name="send" size={18} />
      </button>
    </form>
  );
}

/** Botão flutuante da direção B: pílula "Perguntar". */
export function ChatButton({ onClick, floating = true }: { onClick: () => void; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center gap-2 rounded-full bg-surface-elevated pl-4 pr-5 text-[15px] font-semibold text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.55)]",
        floating && "fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] right-4 z-20 lg:bottom-8 lg:right-8",
      )}
    >
      <Icon name="sparkle" size={20} className="text-accent" />
      Perguntar
    </button>
  );
}
