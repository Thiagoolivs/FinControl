"use client";

import { type KeyboardEvent, useRef } from "react";
import { cn } from "./cn";

export type SegmentOption<T extends string> = { value: T; label: string; tone?: "pj" };

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** tabs = texto com ponto (cabeçalhos, direção B); boxed = trilho com pílula (formulários). */
  variant?: "tabs" | "boxed";
  className?: string;
};

const NEXT_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "tabs",
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = NEXT_KEYS[event.key];
    if (!delta) return;
    event.preventDefault();
    const nextIndex = (index + delta + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        variant === "tabs" ? "flex gap-6" : "flex h-11 gap-0.5 rounded-full bg-surface p-[3px]",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const pj = option.tone === "pj";
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={
              variant === "tabs"
                ? cn(
                    "flex h-11 flex-col items-center justify-center gap-1.5 px-0.5 text-[15px] transition-colors duration-200 ease-apple",
                    selected ? cn("font-semibold", pj ? "text-scope-pj" : "text-text-primary") : "text-text-secondary",
                  )
                : cn(
                    "min-w-0 flex-1 truncate rounded-full px-2 text-[15px] transition-colors duration-200 ease-apple",
                    selected
                      ? cn("font-semibold", pj ? "bg-scope-pj text-bg" : "bg-text-primary/12 text-text-primary")
                      : "text-text-secondary",
                  )
            }
          >
            <span>{option.label}</span>
            {variant === "tabs" ? (
              <span
                aria-hidden="true"
                className={cn("size-1 rounded-full", selected ? (pj ? "bg-scope-pj" : "bg-text-primary") : "bg-transparent")}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
