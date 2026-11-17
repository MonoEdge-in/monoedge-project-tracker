"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_COLUMNS,
  PRIORITY_TOKENS,
  STATUS_TOKENS,
  PRODUCT_TOKENS,
} from "@/lib/constants";
import { useActiveMembers } from "@/lib/store";
import { PRIORITIES, PRODUCTS } from "@/lib/types";
import type { Priority, Product, Status } from "@/lib/types";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { tone } from "@/components/shared/tone";

const UNASSIGNED = "__unassigned__";
const NO_TYPE = "__none__";

const triggerClass =
  "h-9 w-full border-input bg-card text-[13px] data-[placeholder]:text-muted-foreground";

/** A labelled row. Labels are mono so a field name never reads as content. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-mono text-muted-foreground">{label}</span>
        {hint && (
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** The inline "cannot start with =" message, under the field it is about. */
export function FormulaError({
  problem,
  field,
}: {
  problem: { field: string; message: string } | null;
  field: string;
}) {
  if (problem?.field !== field) return null;
  return (
    <p role="alert" className="text-[11.5px] text-destructive">
      {problem.message}
    </p>
  );
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (v: Status) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Status)}>
      <SelectTrigger className={triggerClass} aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      {/* Grouped by board column, so it is obvious which column a status
          will land the card in. */}
      <SelectContent>
        {ALL_COLUMNS.map((column) => (
          <SelectGroup key={column.id}>
            <SelectLabel className="label-mono text-muted-foreground">
              {column.label}
            </SelectLabel>
            {column.statuses.map((s) => (
              <SelectItem key={s} value={s} className="text-[13px]">
                <span className="flex items-center gap-2">
                  <i className="dot" style={tone(STATUS_TOKENS[s].color)} />
                  {s}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (v: Priority) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Priority)}>
      <SelectTrigger className={triggerClass} aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p} className="text-[13px]">
            <span className="flex items-center gap-2">
              <i className="dot" style={tone(PRIORITY_TOKENS[p].color)} />
              {p}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TypeSelect({
  value,
  onChange,
  allowEmpty = true,
}: {
  value: Product | null;
  onChange: (v: Product | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Select
      // Always a string. `undefined` makes the select uncontrolled, so a
      // choice the save then rejects stays painted in the trigger.
      value={value ?? NO_TYPE}
      onValueChange={(v) => onChange(v === NO_TYPE ? null : (v as Product))}
    >
      <SelectTrigger className={triggerClass} aria-label="Product">
        <SelectValue placeholder={allowEmpty ? undefined : "Choose a product"} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? (
          <SelectItem value={NO_TYPE} className="text-[13px] text-muted-foreground">
            No product
          </SelectItem>
        ) : !value ? (
          <SelectItem
            value={NO_TYPE}
            disabled
            className="text-[13px] text-muted-foreground"
          >
            Choose a product
          </SelectItem>
        ) : null}
        {PRODUCTS.map((t) => (
          <SelectItem key={t} value={t} className="text-[13px]">
            <span className="flex items-center gap-2">
              <i className="dot" style={tone(PRODUCT_TOKENS[t].color)} />
              {t}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssigneeSelect({
  value,
  onChange,
  label = "Primary person",
  placeholder = "Unassigned",
  allowEmpty = true,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  placeholder?: string;
  /** When false, a person must be chosen. */
  allowEmpty?: boolean;
}) {
  const members = useActiveMembers();

  return (
    <Select
      // Always a string. `undefined` makes the select uncontrolled, so a
      // person the save then rejects stays painted in the trigger — the
      // menu says Krishna while the card still has nobody assigned.
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
    >
      <SelectTrigger className={triggerClass} aria-label={label}>
        <SelectValue placeholder={allowEmpty ? placeholder : "Choose someone"} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? (
          <SelectItem
            value={UNASSIGNED}
            className="text-[13px] text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              <PersonAvatar memberId={null} size="sm" />
              {placeholder}
            </span>
          </SelectItem>
        ) : !value ? (
          <SelectItem
            value={UNASSIGNED}
            disabled
            className="text-[13px] text-muted-foreground"
          >
            Choose someone
          </SelectItem>
        ) : null}
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id} className="text-[13px]">
            <span className="flex items-center gap-2">
              <PersonAvatar memberId={m.id} size="sm" />
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateField({
  value,
  onChange,
  label,
  readOnlyHint,
  ariaInvalid,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  readOnlyHint?: string;
  ariaInvalid?: boolean;
}) {
  return (
    <Field label={label} hint={readOnlyHint}>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-card px-2.5 font-mono text-[12.5px] tabular",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
          !value && "text-muted-foreground",
        )}
      />
    </Field>
  );
}
