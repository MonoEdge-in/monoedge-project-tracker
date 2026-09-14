"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mark } from "@/components/shared/mark";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { StatusChip, WorkItemRef } from "@/components/shared/badges";
import { Segmented } from "@/components/layout/filter-bar";
import { ThemeToggle } from "@/components/layout/top-bar";
import { UserMenu } from "@/components/layout/user-menu";
import {
  buildReport,
  daysBefore,
  type Outcome,
  type PersonStats,
  type Slip,
} from "@/lib/analytics";
import { formatShort, todayIso } from "@/lib/dates";
import { useMembers, useTracker } from "@/lib/store";
import { cn } from "@/lib/utils";

/*
 * Palette note. The three outcome colours live in globals.css as
 * --viz-on-time / --viz-late / --viz-overdue and were run through the
 * dataviz palette validator as a set, all pairs, against the card surface:
 *
 *   light #2a78d6 #ec835a #b3261e on #ffffff — every hard check passes;
 *     worst colour-blind separation ΔE 21.3, normal-vision ΔE 22.2.
 *   dark  #3987e5 #cf7a2e #b02a2a on #0e131e — every hard check passes;
 *     worst colour-blind separation ΔE 16.0, normal-vision ΔE 18.3.
 *
 * One mark per mode sits under 3:1 against the surface (the orange in light,
 * the deep red in dark). That obligates a second channel, which is why late
 * and overdue also differ in *shape* on the chart and every value is in a
 * table as well. Green for "on time" was tried and dropped: against the red
 * it measured ΔE 4.1 for deuteranopes, i.e. the same colour.
 */

type Period = "30" | "90" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

const OUTCOME: Record<Outcome, { label: string; fill: string }> = {
  "on-time": { label: "On time", fill: "bg-viz-on-time" },
  late: { label: "Delivered late", fill: "bg-viz-late" },
  overdue: { label: "Still overdue", fill: "bg-viz-overdue" },
};

/** Map key for a person, since Unassigned is null and Map keys want one type. */
const UNASSIGNED = "__unassigned__";
const keyOf = (id: string | null) => id ?? UNASSIGNED;

const pct = (rate: number | null) =>
  rate === null ? "—" : `${Math.round(rate * 100)}%`;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function AnalyticsDashboard() {
  const items = useTracker((s) => s.items);
  const loading = useTracker((s) => s.loading);
  const sync = useTracker((s) => s.sync);
  const error = useTracker((s) => s.error);
  const load = useTracker((s) => s.load);
  const members = useMembers();

  // Always re-read. Arriving from the board, the store already holds items
  // and they render at once; this only makes sure a review is never run
  // against a board someone left open since yesterday.
  useEffect(() => {
    void load();
  }, [load]);

  const [period, setPeriod] = useState<Period>("all");
  const [focus, setFocus] = useState<string | null>(null);

  const today = todayIso();
  const report = useMemo(
    () =>
      buildReport(items, members, {
        today,
        from: period === "all" ? null : daysBefore(today, Number(period)),
      }),
    [items, members, today, period],
  );

  const nameOf = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.name]));
    return (id: string | null) =>
      id === null ? "Unassigned" : (byId.get(id) ?? id);
  }, [members]);

  const focused = focus
    ? report.people.find((p) => keyOf(p.memberId) === focus)
    : undefined;

  const firstLoad = loading && items.length === 0;

  return (
    <main className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-card px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="display-mark text-[13px] leading-none">MonoEdge</span>
        </Link>
        <span aria-hidden className="h-5 w-px bg-rule" />
        <span className="label-mono text-foreground">Analytics</span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Link href="/">
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Board</span>
            </Link>
          </Button>
          <ThemeToggle />
          <span aria-hidden className="h-5 w-px bg-rule" />
          <UserMenu />
        </div>
      </header>

      <div className="board-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
          {/* One filter row, above everything it scopes. */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
                Delivery against planned dates
              </h1>
              <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                Who missed a planned date, and by how many days. Scored against
                Primary Person, in calendar days.
              </p>
            </div>
            <Segmented
              ariaLabel="Period"
              value={period}
              onChange={setPeriod}
              options={PERIODS}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}

          {firstLoad ? (
            <DashboardSkeleton />
          ) : (
            // A refetch holds the last render, dimmed, rather than flashing
            // back to a skeleton and jumping the layout.
            <div
              className={cn(
                "space-y-5 transition-opacity",
                sync === "syncing" && "opacity-60",
              )}
            >
              <Kpis team={report.team} nameOf={nameOf} />

              <Card
                title="How late, task by task"
                subtitle="Each mark is one task that missed its planned date. Hover or focus a mark for the task."
                aside={<Legend />}
              >
                <StripPlot
                  people={report.people}
                  nameOf={nameOf}
                  focus={focus}
                />
              </Card>

              <Card
                title="By person"
                subtitle="Select a row to list that person's missed dates below."
              >
                <PeopleTable
                  people={report.people}
                  nameOf={nameOf}
                  focus={focus}
                  onFocus={(k) => setFocus((f) => (f === k ? null : k))}
                />
              </Card>

              <Card
                title={
                  focused
                    ? `Missed dates · ${nameOf(focused.memberId)}`
                    : "Missed dates"
                }
                subtitle="Worst first."
                aside={
                  focused && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFocus(null)}
                      className="h-7 gap-1 px-2 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                      Everyone
                    </Button>
                  )
                }
              >
                <SlipTable
                  slips={focused ? focused.slips : report.team.slips}
                  nameOf={nameOf}
                  showPerson={!focused}
                />
              </Card>

              <Method team={report.team} notDue={report.notDue} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-rule bg-card">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-[13.5px] font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {aside}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kpis({
  team,
  nameOf,
}: {
  team: PersonStats;
  nameOf: (id: string | null) => string;
}) {
  const avg = team.avgDaysLate;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="On-time delivery"
        value={pct(team.onTimeRate)}
        detail={
          team.due
            ? `${team.onTime} of ${team.due} due tasks`
            : "Nothing was due in this period"
        }
      />
      <Tile
        label="Missed dates"
        value={String(team.missed)}
        detail={`${team.late} delivered late · ${team.overdue} still open`}
      />
      <Tile
        label="Days late, total"
        value={String(team.daysLate)}
        detail={
          avg === null
            ? "No missed dates"
            : `${avg.toFixed(1)} days per missed task`
        }
      />
      <Tile
        label="Worst slip"
        value={team.worst ? days(team.worst.days) : "—"}
        detail={
          team.worst
            ? `MON-${team.worst.item.ref} · ${nameOf(team.worst.item.assigneeId)}`
            : "No missed dates"
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-rule bg-card px-4 py-3">
      <div className="label-mono text-muted-foreground">{label}</div>
      {/* Proportional figures: tabular digits look loose at this size. */}
      <div className="text-[26px] leading-none font-semibold tracking-[-0.02em]">
        {value}
      </div>
      <div className="text-[11.5px] leading-snug text-muted-foreground">{detail}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Late is a circle, overdue a diamond: the shape carries the difference
 *  for anyone the colour does not reach. */
function OutcomeMark({
  outcome,
  className,
}: {
  outcome: Exclude<Outcome, "on-time">;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0",
        outcome === "late"
          ? "rounded-full bg-viz-late"
          : "rotate-45 rounded-[1.5px] bg-viz-overdue",
        className,
      )}
    />
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <OutcomeMark outcome="late" />
        Delivered late
      </span>
      <span className="flex items-center gap-1.5">
        <OutcomeMark outcome="overdue" />
        Still overdue
      </span>
    </div>
  );
}

/** Clean ticks for a days axis: 0 to a round top, about four steps. */
function daysScale(max: number) {
  const step =
    [1, 2, 5, 10, 15, 20, 30, 50, 100, 200].find((s) => s * 4 >= max) ?? 500;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

/** Vertical nudges for marks that land on the same day in one row. */
const NUDGE = [0, -7, 7, -14, 14];

function StripPlot({
  people,
  nameOf,
  focus,
}: {
  people: PersonStats[];
  nameOf: (id: string | null) => string;
  focus: string | null;
}) {
  const rows = people
    .filter((p) => p.slips.length > 0)
    .sort(
      (a, b) =>
        // Unassigned is not a person under review: last, as in the table.
        Number(a.memberId === null) - Number(b.memberId === null) ||
        b.daysLate - a.daysLate,
    );

  if (!rows.length) {
    return (
      <p className="py-6 text-center text-[12.5px] text-muted-foreground">
        Nobody missed a planned date in this period.
      </p>
    );
  }

  const { top, ticks } = daysScale(
    Math.max(...rows.flatMap((r) => r.slips.map((s) => s.days))),
  );
  const x = (d: number) => `${(d / top) * 100}%`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {rows.map((row) => {
          const seen = new Map<number, number>();
          const dimmed = focus !== null && keyOf(row.memberId) !== focus;
          return (
            <div
              key={keyOf(row.memberId)}
              className={cn(
                "grid grid-cols-[96px_1fr_56px] items-center gap-3 transition-opacity sm:grid-cols-[132px_1fr_64px]",
                dimmed && "opacity-35",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <PersonAvatar memberId={row.memberId} size="sm" />
                <span className="truncate">{nameOf(row.memberId)}</span>
              </span>

              <div className="relative mx-2 h-11">
                {ticks.map((t) => (
                  <span
                    key={t}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-rule"
                    style={{ left: x(t) }}
                  />
                ))}
                {row.slips.map((slip) => {
                  const n = seen.get(slip.days) ?? 0;
                  seen.set(slip.days, n + 1);
                  return (
                    <SlipMark
                      key={slip.item.id}
                      slip={slip}
                      left={x(slip.days)}
                      nudge={NUDGE[n % NUDGE.length]}
                    />
                  );
                })}
              </div>

              <span className="text-right font-mono text-[11px] text-muted-foreground tabular">
                {row.daysLate}d
              </span>
            </div>
          );
        })}

        {/* Axis */}
        <div className="grid grid-cols-[96px_1fr_56px] gap-3 sm:grid-cols-[132px_1fr_64px]">
          <span />
          <div className="relative mx-2 h-5 border-t border-rule-strong">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute top-1 -translate-x-1/2 font-mono text-[10px] text-muted-foreground tabular"
                style={{ left: x(t) }}
              >
                {t}
              </span>
            ))}
          </div>
          <span className="pt-1 text-right font-mono text-[10px] text-muted-foreground">
            total
          </span>
        </div>
        <div className="grid grid-cols-[96px_1fr_56px] gap-3 sm:grid-cols-[132px_1fr_64px]">
          <span />
          <span className="text-center text-[10.5px] text-muted-foreground">
            Days past planned date
          </span>
        </div>
      </div>
    </div>
  );
}

function SlipMark({
  slip,
  left,
  nudge,
}: {
  slip: Slip;
  left: string;
  nudge: number;
}) {
  const { item, outcome } = slip;
  if (outcome === "on-time") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The hit area is 24px; the mark inside is 10px. Nobody should have
            to land on a dot dead-centre to read it. */}
        <button
          type="button"
          aria-label={`MON-${item.ref}, ${days(slip.days)} late, ${OUTCOME[outcome].label.toLowerCase()}`}
          className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          style={{ left, top: `calc(50% + ${nudge}px)` }}
        >
          <OutcomeMark
            outcome={outcome}
            className="ring-2 ring-card transition-transform group-hover:scale-125 group-focus-visible:scale-125"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <div className="space-y-0.5 py-0.5">
          <div className="text-[12.5px] font-semibold">
            {days(slip.days)} late
          </div>
          <div className="text-[11.5px] opacity-85">
            MON-{item.ref} · {item.title}
          </div>
          <div className="font-mono text-[10.5px] opacity-70">
            Planned {formatShort(item.plannedDate)} →{" "}
            {outcome === "late"
              ? `delivered ${formatShort(item.actualDate)}`
              : `still open (${item.status})`}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */

type SortKey =
  | "name"
  | "due"
  | "rate"
  | "late"
  | "overdue"
  | "daysLate"
  | "avg"
  | "worst";

const COLS: {
  key: SortKey | null;
  label: string;
  align?: "right";
  mark?: Exclude<Outcome, "on-time">;
}[] = [
  { key: "name", label: "Person" },
  { key: "due", label: "Scored", align: "right" },
  { key: "rate", label: "On time" },
  { key: "late", label: "Late", align: "right", mark: "late" },
  { key: "overdue", label: "Overdue", align: "right", mark: "overdue" },
  { key: "daysLate", label: "Days late", align: "right" },
  { key: "avg", label: "Avg", align: "right" },
  { key: "worst", label: "Worst", align: "right" },
  { key: null, label: "Not scored" },
];

function PeopleTable({
  people,
  nameOf,
  focus,
  onFocus,
}: {
  people: PersonStats[];
  nameOf: (id: string | null) => string;
  focus: string | null;
  onFocus: (key: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "daysLate",
    dir: -1,
  });

  const rows = useMemo(() => {
    const value = (p: PersonStats): string | number | null => {
      switch (sort.key) {
        case "name":
          return nameOf(p.memberId).toLowerCase();
        case "due":
          return p.due;
        case "rate":
          return p.onTimeRate;
        case "late":
          return p.late;
        case "overdue":
          return p.overdue;
        case "daysLate":
          return p.daysLate;
        case "avg":
          return p.avgDaysLate;
        case "worst":
          return p.worst?.days ?? null;
      }
    };
    return [...people].sort((a, b) => {
      // Unassigned is not a person under review; it always sits last.
      if ((a.memberId === null) !== (b.memberId === null)) {
        return a.memberId === null ? 1 : -1;
      }
      const av = value(a);
      const bv = value(b);
      // Nothing-to-score sinks in either direction, so sorting on-time rate
      // ascending finds the worst record, not the people with no record.
      if (av === null || bv === null) {
        if (av === bv) return nameOf(a.memberId).localeCompare(nameOf(b.memberId));
        return av === null ? 1 : -1;
      }
      if (av === bv) return nameOf(a.memberId).localeCompare(nameOf(b.memberId));
      return (av > bv ? 1 : -1) * sort.dir;
    });
  }, [people, sort, nameOf]);

  const press = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : // Names read A→Z; every number reads worst-first.
          { key, dir: key === "name" || key === "rate" ? 1 : -1 },
    );

  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.label}
                scope="col"
                aria-sort={
                  c.key && sort.key === c.key
                    ? sort.dir === 1
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={cn(
                  "border-b border-rule px-4 pb-2 whitespace-nowrap",
                  c.align === "right" && "text-right",
                )}
              >
                {c.key ? (
                  <button
                    type="button"
                    onClick={() => press(c.key!)}
                    className={cn(
                      "label-mono inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground",
                      sort.key === c.key && "text-foreground",
                    )}
                  >
                    {c.mark && <OutcomeMark outcome={c.mark} className="size-2" />}
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === 1 ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                ) : (
                  <span className="label-mono text-muted-foreground">
                    {c.label}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const key = keyOf(p.memberId);
            const selected = focus === key;
            const notScored = [
              p.unplanned && `${p.unplanned} unplanned`,
              p.parked && `${p.parked} on hold`,
              p.unmeasured && `${p.unmeasured} no actual date`,
            ].filter(Boolean);

            return (
              <tr
                key={key}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onFocus(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onFocus(key);
                  }
                }}
                className={cn(
                  "cursor-default transition-colors focus-visible:outline-none",
                  selected
                    ? "bg-brand-tint"
                    : "hover:bg-muted/50 focus-visible:bg-muted/50",
                  p.memberId === null && "text-muted-foreground",
                )}
              >
                <Td>
                  <span className="flex items-center gap-2">
                    <PersonAvatar memberId={p.memberId} size="sm" />
                    <span className="truncate font-medium">
                      {nameOf(p.memberId)}
                    </span>
                  </span>
                </Td>
                <Td right>{p.due || "—"}</Td>
                <Td>
                  <RateCell p={p} />
                </Td>
                <Td right>{p.late || "—"}</Td>
                <Td right>{p.overdue || "—"}</Td>
                <Td right className="font-semibold">
                  {p.daysLate || "—"}
                </Td>
                <Td right>
                  {p.avgDaysLate === null ? "—" : p.avgDaysLate.toFixed(1)}
                </Td>
                <Td right>{p.worst ? p.worst.days : "—"}</Td>
                <Td className="text-[11.5px] text-muted-foreground">
                  {notScored.length ? notScored.join(" · ") : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** On-time rate as a number and a thin three-part bar of what it is made of. */
function RateCell({ p }: { p: PersonStats }) {
  if (!p.due) return <span className="text-muted-foreground">—</span>;

  const parts: [Outcome, number][] = [
    ["on-time", p.onTime],
    ["late", p.late],
    ["overdue", p.overdue],
  ];

  return (
    <span className="flex items-center gap-2.5">
      <span className="w-9 text-right font-mono text-[12px] tabular">
        {pct(p.onTimeRate)}
      </span>
      <span
        aria-hidden
        className="flex h-1.5 w-24 gap-[2px] overflow-hidden rounded-full"
      >
        {parts
          .filter(([, n]) => n > 0)
          .map(([o, n]) => (
            <span
              key={o}
              className={cn("h-full", OUTCOME[o].fill)}
              style={{ flexGrow: n, flexBasis: 0 }}
            />
          ))}
      </span>
    </span>
  );
}

function Td({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-rule px-4 py-2.5 text-[12.5px] align-middle whitespace-nowrap",
        right && "text-right font-mono tabular",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */

function SlipTable({
  slips,
  nameOf,
  showPerson,
}: {
  slips: Slip[];
  nameOf: (id: string | null) => string;
  showPerson: boolean;
}) {
  if (!slips.length) {
    return (
      <p className="py-6 text-center text-[12.5px] text-muted-foreground">
        No missed dates in this period.
      </p>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {[
              { l: "Days late", r: true },
              { l: "Task" },
              ...(showPerson ? [{ l: "Person" }] : []),
              { l: "Planned", r: true },
              { l: "Delivered", r: true },
              { l: "Status" },
            ].map((h) => (
              <th
                key={h.l}
                scope="col"
                className={cn(
                  "label-mono border-b border-rule px-4 pb-2 whitespace-nowrap text-muted-foreground",
                  h.r && "text-right",
                )}
              >
                {h.l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slips.map(({ item, outcome, days: d }) =>
            outcome === "on-time" ? null : (
              <tr key={item.id}>
                <Td right className="w-[1%]">
                  <span className="inline-flex items-center gap-2">
                    <OutcomeMark outcome={outcome} className="size-2" />
                    <span className="font-semibold">{d}</span>
                  </span>
                </Td>
                <Td className="max-w-[340px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <WorkItemRef refNumber={item.ref} />
                    <span className="truncate">{item.title}</span>
                  </span>
                </Td>
                {showPerson && (
                  <Td>
                    <span className="flex items-center gap-2">
                      <PersonAvatar memberId={item.assigneeId} size="sm" />
                      {nameOf(item.assigneeId)}
                    </span>
                  </Td>
                )}
                <Td right className="text-muted-foreground">
                  {formatShort(item.plannedDate)}
                </Td>
                <Td right className="text-muted-foreground">
                  {outcome === "late" ? formatShort(item.actualDate) : "not yet"}
                </Td>
                <Td>
                  <StatusChip status={item.status} />
                </Td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The rules, stated where the numbers are read. A review figure nobody can
 *  explain is worse than no figure. */
function Method({ team, notDue }: { team: PersonStats; notDue: number }) {
  const excluded = [
    team.unplanned && `${team.unplanned} with no planned date`,
    team.parked && `${team.parked} on hold past their date`,
    team.unmeasured && `${team.unmeasured} completed with no actual date`,
    notDue && `${notDue} not due yet`,
  ].filter(Boolean);

  return (
    <section className="space-y-2 rounded-lg border border-rule bg-muted/40 px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
      <h2 className="label-mono text-foreground">How this is counted</h2>
      <ul className="list-disc space-y-1 pl-4">
        <li>
          A task is due on its planned date and late from the day after.
          Delivered late means Completed with an actual date after the planned
          one; still overdue means not Completed and past the planned date,
          counted to today.
        </li>
        <li>
          Only Primary Person is scored. Secondary person is not held to the
          date.
        </li>
        <li>
          On-hold work past its date is not scored — the board treats parking
          as a decision rather than a slip — but it is counted below and in
          each person&apos;s row.
        </li>
        <li>
          The period filters on planned date: work that was due in that window,
          wherever it has got to since.
        </li>
      </ul>
      {excluded.length > 0 && (
        <p>
          <span className="text-foreground">Not scored in this period:</span>{" "}
          {excluded.join(" · ")}.
        </p>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-lg" />
      <Skeleton className="h-[220px] rounded-lg" />
    </div>
  );
}
