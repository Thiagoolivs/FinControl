"use client";

import { type SegmentOption, SegmentedControl } from "./segmented-control";
import type { ScopeFilter } from "./status";

const SCOPE_OPTIONS: readonly SegmentOption<ScopeFilter>[] = [
  { value: "TUDO", label: "Tudo" },
  { value: "PF", label: "PF" },
  { value: "PJ", label: "PJ", tone: "pj" },
];

export function ScopeToggle({
  value,
  onChange,
  className,
}: {
  value: ScopeFilter;
  onChange: (value: ScopeFilter) => void;
  className?: string;
}) {
  return <SegmentedControl label="Escopo" options={SCOPE_OPTIONS} value={value} onChange={onChange} className={className} />;
}
