import { TEAM } from "./constants";
import type {
  IsoDate,
  Member,
  Priority,
  Status,
  WorkItem,
  WorkType,
} from "./types";

/**
 * Pure row <-> WorkItem mapping. No I/O and no credentials, so it can be
 * exercised directly; lib/server/sheet-store.ts wraps it with the Sheets
 * calls.
 *
 * A..L are the columns already in the tracking sheet and are left exactly as
 * they are. M..Q are added by the app on first connect: without a stable ID,
 * inserting a row above shifts every card's identity and edits land on the
 * wrong task.
 *
 * Secondary Person (D) and Notes (F) were inserted into the sheet by hand,
 * which pushed everything to their right along by two columns.
 */
export const COLS = {
  title: "A",
  description: "B",
  person: "C",
  secondaryPerson: "D",
  status: "E",
  notes: "F",
  created: "G",
  started: "H",
  planned: "I",
  actual: "J",
  priority: "K",
  type: "L",
  id: "M",
  order: "N",
  assigneeKey: "O",
  updatedAt: "P",
  secondaryKey: "Q",
  storyPoints: "R",
} as const;

export const LAST_COL = "R";
export const FIRST_DATA_ROW = 2;

/** Only the columns the app owns. A..L keep whatever headings you gave them. */
export const MANAGED_HEADERS: [string, string][] = [
  [COLS.id, "Item ID"],
  [COLS.order, "Board Order"],
  [COLS.assigneeKey, "Assignee Key"],
  [COLS.updatedAt, "Updated At"],
  [COLS.secondaryKey, "Secondary Key"],
  [COLS.storyPoints, "Story Points"],
];

export const colIndex = (col: string) => col.charCodeAt(0) - 65;

export const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

type ColKey = keyof typeof COLS;

/** Lowercase, single spaces, and "Functionality / Bug" == "functionality/bug". */
const heading = (v: unknown) =>
  str(v).toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");

const managedLabel = new Map(
  MANAGED_HEADERS.map(([col, label]) => [col, heading(label)]),
);

/**
 * What each column's heading may say.
 *
 * The app's own columns must carry exactly the label it wrote. The team's
 * columns keep whatever wording people chose, so they are matched on the
 * word that makes each one what it is — "planned", "status" — and never on
 * a word two columns share: every date column contains "date" and "task",
 * so neither decides anything.
 */
const HEADING: Record<ColKey, (h: string) => boolean> = {
  title: (h) => /^(tasks?|task name|title)$/.test(h),
  description: (h) => h.includes("descr"),
  person: (h) => h.includes("primary") || /^(person|assignee|owner)$/.test(h),
  secondaryPerson: (h) => h.includes("secondary") && !h.includes("key"),
  status: (h) => h.includes("status"),
  notes: (h) => /^notes?$/.test(h),
  created: (h) => h.includes("creat"),
  started: (h) => h.includes("start"),
  planned: (h) => h.includes("plan") || h.includes("due"),
  actual: (h) => h.includes("actual"),
  priority: (h) => h.includes("priority"),
  type: (h) => h.includes("functionality") || h.includes("bug") || h === "type",
  id: (h) => h === managedLabel.get(COLS.id),
  order: (h) => h === managedLabel.get(COLS.order),
  assigneeKey: (h) => h === managedLabel.get(COLS.assigneeKey),
  updatedAt: (h) => h === managedLabel.get(COLS.updatedAt),
  secondaryKey: (h) => h === managedLabel.get(COLS.secondaryKey),
  storyPoints: (h) => h === managedLabel.get(COLS.storyPoints),
};

/** What a column is, in words, for the message when it has moved. */
const NAME: Record<ColKey, string> = {
  title: "Tasks",
  description: "Description",
  person: "Primary Person",
  secondaryPerson: "Secondary Person",
  status: "Status",
  notes: "Notes",
  created: "Task Creation Date",
  started: "Task Started Date",
  planned: "Task Planned Date",
  actual: "Task Actual Date",
  priority: "Priority",
  type: "Functionality / Bug",
  id: "Item ID",
  order: "Board Order",
  assigneeKey: "Assignee Key",
  updatedAt: "Updated At",
  secondaryKey: "Secondary Key",
  storyPoints: "Story Points",
};

export interface ColumnProblem {
  col: string;
  found: string;
  expected: string;
}

const KEYS = Object.keys(COLS) as ColKey[];
const APP_OWNED = new Set<ColKey>(
  KEYS.filter((k) => managedLabel.has(COLS[k])),
);

/**
 * Compares row 1 with the column map. Empty means every column is where the
 * app expects it and reading or writing is safe.
 *
 * This is the check that would have caught the Priority/Type overwrite:
 * two columns were inserted, the app still believed column K was Item ID,
 * and it wrote ids over sixty rows of priorities. With this in place the
 * same insert stops the app with a message naming the column instead.
 *
 * It refuses on evidence, not on unfamiliar wording, because a refusal stops
 * the whole board for everyone:
 *
 * - The app's own columns must carry exactly the heading the app wrote.
 * - The team's columns fail only when the heading is recognisably *another*
 *   column's — "Status" sitting where Notes belongs. A heading worded in a
 *   way nothing here recognises passes, since it is no sign of a shift.
 *
 * Moving a column still cannot slip through: whatever is inserted or
 * deleted, the recognisable headings beside it, and the app's own columns
 * after it, all land under the wrong letters. A blank heading passes too —
 * the app fills in its own blank headings on load.
 */
export function checkHeaders(header: unknown[]): ColumnProblem[] {
  return KEYS.flatMap((key) => {
    const col = COLS[key];
    const found = str(header[colIndex(col)]);
    if (!found) return [];

    const h = heading(found);
    if (HEADING[key](h)) return [];

    const misplaced =
      APP_OWNED.has(key) || KEYS.some((other) => HEADING[other](h));
    return misplaced ? [{ col, found, expected: NAME[key] }] : [];
  });
}

/**
 * Sheets stores dates as whole days since 1899-12-30. Reading the formatted
 * text instead would give "6-Aug", which has no year and cannot be turned
 * back into a real date.
 */
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(v: unknown): IsoDate | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(SHEETS_EPOCH + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  // Someone typed into the cell rather than using the date picker.
  const text = str(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return null;
}

export function toStoryPoints(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const rounded = Math.round(v);
    return rounded >= 0 ? rounded : null;
  }
  const text = str(v);
  if (!text) return null;
  const match = /^\s*(\d+)/.exec(text);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

const key = (v: unknown) => str(v).toLowerCase().replace(/[\s_-]+/g, " ");

/**
 * Accepts the sheet's current dropdown as well as the app's own values, so
 * the existing sheet imports without anyone editing it first. "Define
 * Approach" no longer exists as a column, so it folds into In Progress.
 */
export const STATUS_ALIASES: Record<string, Status> = {
  "yet to start": "Yet to Start",
  "not started": "Yet to Start",
  backlog: "Yet to Start",
  "define approach": "In Progress",
  "in progress": "In Progress",
  wip: "In Progress",
  // Retired stages. Ready to Merge and Pending Prod Push were dropped from
  // the set; both describe work whose pull request already exists, so they
  // fold forward into PR created. Nothing is folded into Completed — the
  // board must never claim something shipped on a guess.
  "pr created": "PR Created",
  "pr review": "PR Created",
  "in review": "PR Created",
  review: "PR Created",
  "ready to merge": "PR Created",
  "pending prod push": "PR Created",
  "pending production push": "PR Created",
  testing: "In Testing",
  "testing done": "In Testing",
  "in testing": "In Testing",
  qa: "In Testing",
  completed: "Completed",
  complete: "Completed",
  done: "Completed",
  shipped: "Completed",
  "on hold": "On-hold",
  onhold: "On-hold",
  blocked: "On-hold",
  parked: "On-hold",
};

export const PRIORITY_ALIASES: Record<string, Priority> = {
  critical: "Critical",
  urgent: "Critical",
  p0: "Critical",
  high: "High",
  p1: "High",
  medium: "Medium",
  med: "Medium",
  normal: "Medium",
  p2: "Medium",
  low: "Low",
  p3: "Low",
};

export const TYPE_ALIASES: Record<string, WorkType> = {
  "product functionality": "Product Functionality",
  product: "Product Functionality",
  "client functionality": "Client Functionality",
  client: "Client Functionality",
  bug: "Bug",
  defect: "Bug",
  fix: "Bug",
};

/**
 * Works out who a Primary Person cell refers to.
 *
 * The app writes full names into column C, but a human typing straight into
 * the sheet writes "Vismay", or "VR", or an email. Exact matches are tried
 * first; looser ones only count when they land on exactly one person, so a
 * team with two Priyas never silently assigns work to the wrong one.
 */
export function resolveMember(
  personText: string,
  assigneeKey: string,
  team: Member[] = TEAM,
): Member | null {
  const key = personText.trim().toLowerCase().replace(/\s+/g, " ");
  const stored = assigneeKey.trim().toLowerCase();

  // Column M is written by the app and is authoritative.
  const byKey = team.find((m) => m.id.toLowerCase() === stored);
  if (byKey) return byKey;
  if (!key) return null;

  const exact =
    team.find((m) => m.name.toLowerCase() === key) ??
    team.find((m) => m.id.toLowerCase() === key) ??
    team.find((m) => m.email?.toLowerCase() === key);
  if (exact) return exact;

  // Every loose form is pooled rather than tried in sequence. Cascading
  // tiers hide real ambiguity: with two Priyas, "Priya" is ambiguous by
  // first name, but one of them may still own the shorter email alias, and
  // a tier-by-tier search would quietly hand the work to whoever that is.
  const loose = team.filter(
    (m) =>
      m.name.toLowerCase().split(" ")[0] === key ||
      (m.email ?? "").toLowerCase().split("@")[0] === key ||
      m.initials.toLowerCase() === key,
  );
  return loose.length === 1 ? loose[0] : null;
}

export function rowToItem(
  row: unknown[],
  rowNumber: number,
  warnings: string[],
  /** The roster as the Team tab has it. Defaults to the seed list so the
   *  local draft backend and the mapping tests need no sheet. */
  team: Member[] = TEAM,
): WorkItem | null {
  const cell = (col: string) => row[colIndex(col)];

  // A row is only skipped when it is completely empty; a blank Tasks cell
  // with real dates and a status is still a real row worth importing.
  const hasContent = Object.values(COLS).some((c) => str(cell(c)) !== "");
  if (!hasContent) return null;

  const rawStatus = str(cell(COLS.status));
  let status = STATUS_ALIASES[key(rawStatus)];
  if (!status) {
    status = "Yet to Start";
    if (rawStatus) {
      warnings.push(`Row ${rowNumber}: status "${rawStatus}" not recognised`);
    }
  }

  const rawPriority = str(cell(COLS.priority));
  let priority = PRIORITY_ALIASES[key(rawPriority)];
  if (!priority) {
    priority = "Medium";
    if (rawPriority) {
      warnings.push(`Row ${rowNumber}: priority "${rawPriority}" not recognised`);
    }
  }

  const rawType = str(cell(COLS.type));
  const type: WorkType | null = rawType
    ? (TYPE_ALIASES[key(rawType)] ?? null)
    : null;
  if (rawType && !type) {
    warnings.push(`Row ${rowNumber}: type "${rawType}" not recognised`);
  }

  const personName = str(cell(COLS.person));
  const member = resolveMember(personName, str(cell(COLS.assigneeKey)), team);
  const assigneeId = member?.id ?? null;
  if (personName && !assigneeId) {
    warnings.push(
      `Row ${rowNumber}: "${personName}" is not on the team — add them to the Team tab`,
    );
  }

  const secondName = str(cell(COLS.secondaryPerson));
  const second = resolveMember(secondName, str(cell(COLS.secondaryKey)), team);
  const secondaryAssigneeId = second?.id ?? null;
  if (secondName && !secondaryAssigneeId) {
    warnings.push(
      `Row ${rowNumber}: secondary person "${secondName}" is not on the team — add them to the Team tab`,
    );
  }

  const id = str(cell(COLS.id));
  const refMatch = /(\d+)\s*$/.exec(id);
  const orderRaw = cell(COLS.order);

  return {
    id: id || `row-${rowNumber}`,
    ref: refMatch ? Number(refMatch[1]) : rowNumber - 1,
    title: str(cell(COLS.title)) || "(untitled)",
    description: str(cell(COLS.description)),
    assigneeId,
    secondaryAssigneeId,
    status,
    notes: str(cell(COLS.notes)),
    createdDate: toIsoDate(cell(COLS.created)),
    startedDate: toIsoDate(cell(COLS.started)),
    plannedDate: toIsoDate(cell(COLS.planned)),
    actualDate: toIsoDate(cell(COLS.actual)),
    priority,
    type,
    storyPoints: toStoryPoints(cell(COLS.storyPoints)),
    sheetRow: rowNumber,
    order: typeof orderRaw === "number" ? orderRaw : rowNumber,
    updatedAt: str(cell(COLS.updatedAt)) || new Date(0).toISOString(),
  };
}

/**
 * Highest reference already claimed in the sheet. Only rows carrying a real
 * `MON-n` id count: an unsaved row gets a placeholder ref derived from its
 * row number, and treating those as claimed makes the first import skip a
 * block of numbers — a sheet of five fresh rows would come out MON-6..MON-10.
 */
export function highestRef(items: { id: string }[]): number {
  return items.reduce((max, i) => {
    const m = /^MON-(\d+)$/.exec(i.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

/** The A..R cells for a whole row, in column order. */
export function itemToRow(item: WorkItem, team: Member[] = TEAM): unknown[] {
  const member = team.find((m) => m.id === item.assigneeId);
  const second = team.find((m) => m.id === item.secondaryAssigneeId);
  return [
    item.title,
    item.description,
    member?.name ?? "", // C stays human-readable for anyone reading the sheet
    second?.name ?? "", // D likewise
    item.status,
    item.notes,
    item.createdDate ?? "",
    item.startedDate ?? "",
    item.plannedDate ?? "",
    item.actualDate ?? "",
    item.priority,
    item.type ?? "",
    item.id,
    item.order,
    item.assigneeId ?? "",
    item.updatedAt,
    item.secondaryAssigneeId ?? "",
    item.storyPoints !== null && item.storyPoints !== undefined
      ? item.storyPoints
      : "",
  ];
}
