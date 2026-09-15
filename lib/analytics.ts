import type { IsoDate, Member, WorkItem } from "./types";

/**
 * Delivery against planned dates, per person. Pure: no store, no clock — the
 * caller passes `today` — so every rule below is checkable by a script
 * rather than by squinting at a dashboard.
 *
 * These numbers feed performance reviews, so each rule is written down here
 * rather than left implicit in a chart:
 *
 * - **Only Primary Person is scored.** Secondary person is a helper; the
 *   owner is accountable for the date.
 * - **A task is due on its planned date and late the day after.** Delivered
 *   on the planned date is on time.
 * - **Delivered late** = Completed, actual date after planned date. Days late
 *   is the gap.
 * - **Still overdue** = not Completed, planned date already passed. Days late
 *   is counted to today, so it keeps growing until the task lands.
 * - **Calendar days**, not working days.
 * - **Not scored**, but counted so nothing disappears silently:
 *   - no planned date — cannot be late, which is exactly why it is surfaced;
 *   - On-hold past its planned date — the board treats parking as a decision
 *     rather than a slip (see isOverdue in dates.ts), and this follows suit;
 *   - Completed with no actual date — nothing to measure against;
 *   - not due yet.
 * - **The period filters on planned date.** "Last 30 days" means work that
 *   was due in the last 30 days, wherever it has got to since.
 */

export type Outcome = "on-time" | "late" | "overdue";

export interface Slip {
  item: WorkItem;
  outcome: Outcome;
  /** Calendar days past the planned date. 0 for on time. */
  days: number;
}

export interface PersonStats {
  /** Null is the Unassigned row. */
  memberId: string | null;
  /** On time + delivered late + still overdue: everything that was scored. */
  due: number;
  onTime: number;
  late: number;
  overdue: number;
  /** late + overdue */
  missed: number;
  /** on-time / due, or null when nothing was due. */
  onTimeRate: number | null;
  /** Sum of days late across delivered-late and still-overdue work. */
  daysLate: number;
  /** daysLate / missed, or null when nothing slipped. */
  avgDaysLate: number | null;
  worst: Slip | null;
  /** Every scored slip, worst first. On-time work is left out. */
  slips: Slip[];
  unplanned: number;
  parked: number;
  unmeasured: number;
}

export interface Report {
  people: PersonStats[];
  /** Everyone together, unassigned work included. memberId is null. */
  team: PersonStats;
  notDue: number;
}

const toUtc = (iso: IsoDate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};

/** Whole calendar days from `a` to `b`. UTC throughout, so a clock change
 *  cannot turn a one-day slip into zero or two. */
export const daysBetween = (a: IsoDate, b: IsoDate): number =>
  Math.round((toUtc(b) - toUtc(a)) / 86_400_000);

type Measured =
  | { kind: "scored"; slip: Slip }
  | { kind: "unplanned" | "parked" | "unmeasured" | "not-due" };

export function measure(item: WorkItem, today: IsoDate): Measured {
  const planned = item.plannedDate;
  if (!planned) return { kind: "unplanned" };

  if (item.status === "Completed") {
    if (!item.actualDate) return { kind: "unmeasured" };
    const days = daysBetween(planned, item.actualDate);
    return {
      kind: "scored",
      slip:
        days > 0
          ? { item, outcome: "late", days }
          : { item, outcome: "on-time", days: 0 },
    };
  }

  const past = daysBetween(planned, today);
  if (past <= 0) return { kind: "not-due" };
  if (item.status === "On-hold") return { kind: "parked" };
  return { kind: "scored", slip: { item, outcome: "overdue", days: past } };
}

function blank(memberId: string | null): PersonStats {
  return {
    memberId,
    due: 0,
    onTime: 0,
    late: 0,
    overdue: 0,
    missed: 0,
    onTimeRate: null,
    daysLate: 0,
    avgDaysLate: null,
    worst: null,
    slips: [],
    unplanned: 0,
    parked: 0,
    unmeasured: 0,
  };
}

function finish(p: PersonStats): PersonStats {
  p.missed = p.late + p.overdue;
  p.due = p.onTime + p.missed;
  p.onTimeRate = p.due ? p.onTime / p.due : null;
  p.avgDaysLate = p.missed ? p.daysLate / p.missed : null;
  p.slips.sort((a, b) => b.days - a.days || a.item.ref - b.item.ref);
  p.worst = p.slips[0] ?? null;
  return p;
}

export function buildReport(
  items: WorkItem[],
  members: Member[],
  {
    today,
    /** Earliest planned date to include; null for all time. */
    from = null,
  }: { today: IsoDate; from?: IsoDate | null },
): Report {
  const byPerson = new Map<string | null, PersonStats>();
  const team = blank(null);
  let notDue = 0;

  // Everyone on the roster gets a row, including people with nothing due. A
  // name missing from a review table reads as a bug, not as a clean record.
  // Someone stood down only appears if they have work in the period.
  for (const m of members) {
    if (m.active !== false) byPerson.set(m.id, blank(m.id));
  }

  for (const item of items) {
    // Unplanned work has no date to fall inside a period, so it is counted
    // regardless: it is the gap the period filter would otherwise hide.
    if (from && item.plannedDate && item.plannedDate < from) continue;

    const key = item.assigneeId;
    let person = byPerson.get(key);
    if (!person) {
      person = blank(key);
      byPerson.set(key, person);
    }

    const m = measure(item, today);
    if (m.kind === "not-due") {
      notDue += 1;
      continue;
    }

    for (const target of [person, team]) {
      if (m.kind !== "scored") {
        if (m.kind === "unplanned") target.unplanned += 1;
        else if (m.kind === "parked") target.parked += 1;
        else target.unmeasured += 1;
        continue;
      }
      const { slip } = m;
      if (slip.outcome === "on-time") {
        target.onTime += 1;
        continue;
      }
      if (slip.outcome === "late") target.late += 1;
      else target.overdue += 1;
      target.daysLate += slip.days;
      target.slips.push(slip);
    }
  }

  return {
    people: [...byPerson.values()].map(finish),
    team: finish(team),
    notDue,
  };
}

/** The ISO date `days` before `today`, for the period presets. */
export function daysBefore(today: IsoDate, days: number): IsoDate {
  const d = new Date(toUtc(today) - days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
