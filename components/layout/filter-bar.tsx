"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, Columns3, Layers, Rows3, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRIORITY_TOKENS, PRODUCT_TOKENS, COLUMNS } from "@/lib/constants";
import { useMembers } from "@/lib/store";
import { PRIORITIES, PRODUCTS } from "@/lib/types";
import type { Filters, GroupBy, Priority, Product } from "@/lib/types";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { tone } from "@/components/shared/tone";

export type View = "board" | "sheet";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex h-8 items-center gap-0.5 rounded-md border border-rule bg-muted/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[10px] font-medium tracking-[0.1em] uppercase transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === o.value
              ? "bg-card text-foreground shadow-[0_1px_2px_rgba(12,27,20,0.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  view,
  onView,
  filters,
  onFilters,
  onClear,
  groupBy,
  onGroupBy,
  showParked,
  onShowParked,
  visible,
  total,
}: {
  view: View;
  onView: (v: View) => void;
  filters: Filters;
  onFilters: (patch: Partial<Filters>) => void;
  onClear: () => void;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  showParked: boolean;
  onShowParked: (v: boolean) => void;
  visible: number;
  total: number;
}) {
  const members = useMembers();

  const filterActive =
    filters.assigneeIds.length +
    filters.priorities.length +
    filters.types.length;

  const displayActive =
    filters.hiddenColumns.length +
    Number(filters.showArchived) +
    (view === "board" && !showParked ? 1 : 0);

  const dirty =
    filterActive > 0 ||
    filters.hiddenColumns.length > 0 ||
    filters.hideCompleted ||
    filters.showArchived ||
    (view === "board" && !showParked) ||
    filters.query.trim() !== "";

  const people = [
    ...members.map((m) => ({ id: m.id, name: m.name })),
    { id: "unassigned", name: "Unassigned" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-rule bg-card px-4 py-2 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Segmented
          ariaLabel="View"
          value={view}
          onChange={onView}
          options={[
            { value: "board", label: "Board", icon: <Columns3 className="size-3" /> },
            { value: "sheet", label: "Sheet", icon: <Rows3 className="size-3" /> },
          ]}
        />

        <span aria-hidden className="hidden h-5 w-px bg-rule sm:block" />

        <FilterMenu
          label="Filters"
          active={filters.assigneeIds.length + filters.priorities.length}
          badge={
            filters.assigneeIds.length + filters.priorities.length > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[9px] leading-4 text-primary-foreground tabular">
                {filters.assigneeIds.length + filters.priorities.length}
              </span>
            ) : null
          }
          onClear={() => onFilters({ assigneeIds: [], priorities: [] })}
          sections={[
            {
              title: "Person",
              options: people.map((p) => ({
                value: `person:${p.id}`,
                label: p.name,
                leading: (
                  <PersonAvatar
                    memberId={p.id === "unassigned" ? null : p.id}
                    size="sm"
                  />
                ),
              })),
              selected: filters.assigneeIds.map((id) => `person:${id}`),
              onToggle: (v) => {
                const id = v.replace(/^person:/, "");
                onFilters({
                  assigneeIds: toggle(filters.assigneeIds, id),
                });
              },
              searchable: true,
            },
            {
              title: "Priority",
              options: PRIORITIES.map((p) => ({
                value: `priority:${p}`,
                label: p,
                color: PRIORITY_TOKENS[p].color,
              })),
              selected: filters.priorities.map((p) => `priority:${p}`),
              onToggle: (v) => {
                const p = v.replace(/^priority:/, "") as Priority;
                onFilters({ priorities: toggle(filters.priorities, p) });
              },
            },
          ]}
        />

        <ProductFilterMenu
          active={filters.types.length}
          selected={filters.types}
          onToggle={(t) => onFilters({ types: toggle(filters.types, t) })}
          onSet={(types) => onFilters({ types })}
        />

        <DisplayMenu
          active={displayActive}
          view={view}
          groupBy={groupBy}
          onGroupBy={onGroupBy}
          hiddenColumns={filters.hiddenColumns}
          showArchived={filters.showArchived}
          showParked={showParked}
          onHiddenColumns={(hiddenColumns) =>
            onFilters({
              hiddenColumns,
              hideCompleted: hiddenColumns.includes("completed"),
            })
          }
          onShowArchived={(v) => onFilters({ showArchived: v })}
          onShowParked={onShowParked}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-muted-foreground tabular">
            {visible === total ? `${total} items` : `${visible} of ${total}`}
          </span>
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-7 gap-1 px-2 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ProductFilterMenu({
  active,
  selected,
  onToggle,
  onSet,
}: {
  active: number;
  selected: Product[];
  onToggle: (t: Product) => void;
  onSet: (types: Product[]) => void;
}) {
  return (
    <FilterMenu
      label="Product"
      active={active}
      sections={[
        {
          title: "Product",
          options: PRODUCTS.map((t) => ({
            value: t,
            label: t,
            color: PRODUCT_TOKENS[t].color,
          })),
          selected,
          onToggle: (v) => onToggle(v as Product),
        },
      ]}
      onClear={() => onSet([])}
    />
  );
}

function DisplayMenu({
  active,
  view,
  groupBy,
  onGroupBy,
  hiddenColumns,
  showArchived,
  showParked,
  onHiddenColumns,
  onShowArchived,
  onShowParked,
}: {
  active: number;
  view: View;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  hiddenColumns: string[];
  showArchived: boolean;
  showParked: boolean;
  onHiddenColumns: (ids: string[]) => void;
  onShowArchived: (v: boolean) => void;
  onShowParked: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const layoutActive = groupBy !== "none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] font-medium tracking-[0.1em] uppercase transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active > 0 || layoutActive
              ? "border-primary/40 bg-brand-tint text-foreground"
              : "border-rule bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-3 opacity-70" />
          Display
          {(active > 0 || layoutActive) && (
            <span className="rounded-full bg-primary px-1.5 text-[9px] leading-4 text-primary-foreground tabular">
              {active + (layoutActive ? 1 : 0)}
            </span>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        {view === "board" && (
          <>
            <p className="label-mono mb-1.5 px-1 text-muted-foreground">
              Group board
            </p>
            <LayoutOption
              label="Flat"
              selected={groupBy === "none"}
              onClick={() => onGroupBy("none")}
            />
            <LayoutOption
              label="By person"
              selected={groupBy === "assignee"}
              onClick={() => onGroupBy("assignee")}
            />
            <LayoutOption
              label="By product"
              selected={groupBy === "product"}
              onClick={() => onGroupBy("product")}
            />
            <div className="my-2 h-px bg-rule" />
          </>
        )}
        <p className="label-mono mb-1.5 px-1 text-muted-foreground">Columns</p>
        {COLUMNS.map((column) => {
          const shown = !hiddenColumns.includes(column.id);
          return (
            <DisplayToggle
              key={column.id}
              label={column.label}
              on={shown}
              onClick={() =>
                onHiddenColumns(
                  shown
                    ? [...hiddenColumns, column.id]
                    : hiddenColumns.filter((id) => id !== column.id),
                )
              }
            />
          );
        })}
        <p className="label-mono mt-2 mb-1.5 px-1 text-muted-foreground">Show</p>
        <DisplayToggle
          label="On-hold column"
          on={view === "board" ? showParked : false}
          disabled={view !== "board"}
          onClick={() => onShowParked(!showParked)}
        />
        <DisplayToggle
          label="Archived completed"
          on={showArchived}
          onClick={() => onShowArchived(!showArchived)}
        />
      </PopoverContent>
    </Popover>
  );
}

function LayoutOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "bg-brand-tint/60 font-medium",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full border",
          selected ? "border-primary bg-primary" : "border-rule bg-card",
        )}
      />
      {label}
    </button>
  );
}

function DisplayToggle({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        disabled && "pointer-events-none opacity-40",
        on && "bg-brand-tint/60",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border",
          on
            ? "border-primary bg-primary text-primary-foreground"
            : "border-rule bg-card",
        )}
      >
        {on && <Check className="size-2.5" />}
      </span>
      {label}
    </button>
  );
}

function FilterMenu({
  label,
  sections,
  active,
  badge,
  onClear,
}: {
  label: string;
  sections: {
    title: string;
    options: {
      value: string;
      label: string;
      color?: string;
      leading?: React.ReactNode;
    }[];
    selected: string[];
    onToggle: (v: string) => void;
    searchable?: boolean;
  }[];
  active: number;
  badge?: React.ReactNode;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const anySelected = sections.some((s) => s.selected.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] font-medium tracking-[0.1em] uppercase transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active > 0
              ? "border-primary/40 bg-brand-tint text-foreground"
              : "border-rule bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {label === "Filters" ? (
            <Layers className="size-3 opacity-70" />
          ) : null}
          {label}
          {active > 0 &&
            (badge ?? (
              <span className="rounded-full bg-primary px-1.5 text-[9px] leading-4 text-primary-foreground tabular">
                {active}
              </span>
            ))}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search filters…"
            className="border-0"
          />
          <CommandList className="max-h-72 p-1">
            <CommandEmpty className="px-2 py-3 text-[12.5px] text-muted-foreground">
              No match.
            </CommandEmpty>
            {sections.map((section, i) => {
              const q = query.trim().toLowerCase();
              const shown = q
                ? section.options.filter(
                    (o) =>
                      o.label.toLowerCase().includes(q) ||
                      section.title.toLowerCase().includes(q),
                  )
                : section.options;
              if (!shown.length) return null;

              return (
                <div key={section.title}>
                  {i > 0 && <CommandSeparator className="my-1" />}
                  <CommandGroup
                    heading={
                      <span className="label-mono text-[10px] text-muted-foreground">
                        {section.title}
                      </span>
                    }
                  >
                    {shown.map((o) => (
                      <CommandItem
                        key={o.value}
                        value={o.value}
                        onSelect={() => section.onToggle(o.value)}
                        data-checked={section.selected.includes(o.value)}
                        className="text-[13px]"
                      >
                        <span className="flex items-center gap-2">
                          {section.selected.includes(o.value) ? (
                            <Check className="size-3.5 text-primary" />
                          ) : (
                            <span className="size-3.5" />
                          )}
                          {o.leading ??
                            (o.color ? (
                              <i className="dot" style={tone(o.color)} />
                            ) : null)}
                          {o.label}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            })}
            {anySelected && (
              <>
                <CommandSeparator className="my-1" />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      if (onClear) onClear();
                      else
                        sections.forEach((s) => {
                          s.selected.forEach((v) => s.onToggle(v));
                        });
                    }}
                    className="text-[12.5px] text-muted-foreground"
                  >
                    Clear {label.toLowerCase()}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
