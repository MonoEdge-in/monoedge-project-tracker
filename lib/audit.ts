import type { Member, WorkItem } from "./types";

/**
 * The change log's vocabulary, and the one function that decides what
 * counts as a change. Pure — no sheet, no session — so the rules are
 * checkable by a script (scripts/check-audit.ts).
 *
 * Every field a person can set is tracked. Bookkeeping is not: the id, the
 * row number, board order (a drag reshuffles a whole column, and logging it
 * would bury the real changes) and updatedAt (it changes on every write by
 * definition).
 */

export type LogAction = "created" | "updated" | "deleted";

export interface LogEntry {
  /** ISO timestamp, UTC. */
  at: string;
  itemId: string;
  /** The task's name at the time, so a log row still reads after a rename
   *  or a delete. */
  title: string;
  action: LogAction;
  /** Human label for the field, e.g. "Planned date". Blank unless updated. */
  field: string;
  from: string;
  to: string;
  /** Display name of whoever did it. */
  by: string;
  byEmail: string;
}

type Tracked = Exclude<
  keyof WorkItem,
  "id" | "ref" | "sheetRow" | "order" | "updatedAt"
>;

/**
 * Tracked fields, in the order a change reads most naturally when several
 * land at once — who and when before what.
 *
 * Typed as a Record over every tracked key, so adding a field to WorkItem
 * without deciding how it is logged is a compile error rather than a silent
 * gap in the history.
 */
const FIELDS: Record<Tracked, { label: string; kind: "text" | "person" | "date" | "value" }> = {
  assigneeId: { label: "Primary person", kind: "person" },
  secondaryAssigneeId: { label: "Secondary person", kind: "person" },
  status: { label: "Status", kind: "value" },
  plannedDate: { label: "Planned date", kind: "date" },
  startedDate: { label: "Started date", kind: "date" },
  actualDate: { label: "Actual date", kind: "date" },
  createdDate: { label: "Created date", kind: "date" },
  priority: { label: "Priority", kind: "value" },
  type: { label: "Functionality / Bug", kind: "value" },
  storyPoints: { label: "Story points", kind: "value" },
  title: { label: "Task", kind: "text" },
  description: { label: "Description", kind: "text" },
  notes: { label: "Notes", kind: "text" },
};

const ORDER = Object.keys(FIELDS) as Tracked[];

function show(
  value: unknown,
  kind: (typeof FIELDS)[Tracked]["kind"],
  team: Member[],
): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "person") {
    // The name, not the id: the log is read by people, in the sheet. An id
    // that has left the roster still prints rather than vanishing.
    return team.find((m) => m.id === value)?.name ?? String(value);
  }
  return String(value);
}

export interface Change {
  field: string;
  from: string;
  to: string;
}

/** What differs between two versions of the same item, as people read it. */
export function diffItems(
  before: WorkItem,
  after: WorkItem,
  team: Member[],
): Change[] {
  const changes: Change[] = [];
  for (const key of ORDER) {
    const { label, kind } = FIELDS[key];
    const from = show(before[key], kind, team);
    const to = show(after[key], kind, team);
    // Compared as displayed, so null and "" (both blank in the sheet) are
    // not reported as a change, and neither is 3 vs "3".
    if (from !== to) changes.push({ field: label, from, to });
  }
  return changes;
}

export interface Actor {
  name: string;
  email: string;
}

/** Log rows for one write. Empty when an update changed nothing. */
export function entriesFor(
  action: LogAction,
  actor: Actor,
  item: WorkItem,
  changes: Change[] = [],
  at = new Date().toISOString(),
): LogEntry[] {
  const base = {
    at,
    itemId: item.id,
    title: item.title,
    action,
    by: actor.name,
    byEmail: actor.email,
  };
  if (action !== "updated") return [{ ...base, field: "", from: "", to: "" }];
  return changes.map((c) => ({ ...base, ...c }));
}
