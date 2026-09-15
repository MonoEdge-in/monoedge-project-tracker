import "server-only";

import {
  COLS,
  FIRST_DATA_ROW,
  LAST_COL,
  MANAGED_HEADERS,
  checkHeaders,
  colIndex,
  highestRef,
  itemToRow,
  rowToItem,
  str,
} from "@/lib/sheet-mapping";
import type { Member, WorkItem } from "@/lib/types";
import { formulaProblem } from "@/lib/validation";
import { loadTeam } from "./team-store";
import {
  deleteRow,
  getTab,
  readConfig,
  readRange,
  readRanges,
  SheetError,
  writeRanges,
  type SheetConfig,
} from "./sheets";

/** The Sheets I/O. All row shaping lives in lib/sheet-mapping.ts. */

export interface LoadResult {
  items: WorkItem[];
  /** Surfaced in the app so bad cells are visible instead of silently coerced. */
  warnings: string[];
  tab: string;
  /**
   * The roster the rows were resolved against, sent on so the browser draws
   * avatars and the assignee pickers from the same list the server mapped
   * with. Without it a new joiner exists for sign-in and nowhere else.
   */
  members: Member[];
}

interface Ctx {
  config: SheetConfig;
  tab: string;
  sheetId: number;
  team: Member[];
}

async function ctx(): Promise<Ctx> {
  const config = readConfig();
  // Both in flight at once: the roster lives in a different tab of the same
  // spreadsheet and neither call depends on the other.
  const [meta, team] = await Promise.all([getTab(config), loadTeam()]);
  return { config, tab: meta.title, sheetId: meta.sheetId, team };
}

/**
 * Adds the four managed headers if they are not there yet. Runs on every
 * load but only writes when something is actually missing, so connecting an
 * untouched sheet needs no manual preparation.
 */
/**
 * Stops everything if the tracking tab's columns are not where the column
 * map says. Runs before any read that feeds a write — including the load,
 * which backfills ids — because a shifted sheet read with the old map is
 * garbage, and garbage written back overwrites real data.
 */
function assertColumns(c: Ctx, header: unknown[]): void {
  const problems = checkHeaders(header);
  if (!problems.length) return;

  const detail = problems
    .slice(0, 3)
    .map((p) => `column ${p.col} is headed "${p.found}" but should be ${p.expected}`)
    .join("; ");
  throw new SheetError(
    `The columns in "${c.tab}" have moved, so the tracker has stopped reading and writing it: ${detail}${problems.length > 3 ? `, and ${problems.length - 3} more` : ""}.`,
    409,
    "A column was probably inserted, deleted or moved in the sheet. Undo that, or have the app's column map (lib/sheet-mapping.ts) updated to match. Nothing was written.",
  );
}

const HEADER_ROW = `A1:${LAST_COL}1`;

async function ensureHeaders(
  c: Ctx,
  /** The heading row, when the caller already fetched it with its data. */
  known?: unknown[],
): Promise<void> {
  const header = known ?? (await readRange(c.config, c.tab, HEADER_ROW))[0] ?? [];
  assertColumns(c, header);
  const missing = MANAGED_HEADERS.filter(
    ([col]) => str(header[colIndex(col)]) === "",
  );
  if (!missing.length) return;

  await writeRanges(
    c.config,
    c.tab,
    missing.map(([col, label]) => ({ a1: `${col}1`, values: [[label]] })),
  );
}

/** Gives pre-existing rows a permanent ID the first time they are seen. */
async function backfillIds(c: Ctx, items: WorkItem[]): Promise<void> {
  const needing = items.filter((i) => !/^MON-\d+$/.test(i.id));
  if (!needing.length) return;

  let next = highestRef(items);
  const updates = needing.map((item) => {
    next += 1;
    item.id = `MON-${next}`;
    item.ref = next;
    return {
      a1: `${COLS.id}${item.sheetRow}:${COLS.order}${item.sheetRow}`,
      values: [[item.id, item.order]],
    };
  });
  await writeRanges(c.config, c.tab, updates);
}

export async function loadItems(): Promise<LoadResult> {
  const c = await ctx();
  // Headings and rows in one request. The board polls this every 25
  // seconds for every open tab, so a round trip saved here is saved a lot.
  const [header, rows] = await readRanges(c.config, c.tab, [
    HEADER_ROW,
    `A${FIRST_DATA_ROW}:${LAST_COL}`,
  ]);
  await ensureHeaders(c, header[0] ?? []);

  const warnings: string[] = [];
  const items = rows
    .map((row, i) => rowToItem(row, FIRST_DATA_ROW + i, warnings, c.team))
    .filter((i): i is WorkItem => i !== null);

  await backfillIds(c, items);
  return { items, warnings, tab: c.tab, members: c.team };
}

/** Also checks the columns: every update and delete finds its row first. */
async function findRow(c: Ctx, id: string): Promise<number> {
  const [header, col] = await readRanges(c.config, c.tab, [
    HEADER_ROW,
    `${COLS.id}${FIRST_DATA_ROW}:${COLS.id}`,
  ]);
  assertColumns(c, header[0] ?? []);
  const idx = col.findIndex((r) => str(r?.[0]) === id);
  if (idx === -1) {
    throw new SheetError(
      `${id} is no longer in the sheet.`,
      409,
      "Someone may have deleted the row. Reload the board.",
    );
  }
  return FIRST_DATA_ROW + idx;
}

/** A row the importer would skip: every column the app reads is blank. */
const rowIsEmpty = (row: unknown[] | undefined): boolean =>
  !row || Object.values(COLS).every((c) => str(row[colIndex(c)]) === "");

/**
 * The row a new item should occupy: the first blank one, or the row after the
 * last used one if there are no gaps.
 *
 * Sheets' own `values.append` cannot be used here. It appends after the last
 * row of the *table* it detects, and this sheet is a structured Table whose
 * range keeps its old extent after the contents of a row are deleted — so
 * clearing rows 2-10 and adding an item put it on row 11, leaving nine blank
 * rows above it. Finding the row ourselves, with the same definition of empty
 * the importer uses, keeps writing and reading in agreement.
 */
async function nextFreeRow(c: Ctx): Promise<number> {
  const rows = await readRange(
    c.config,
    c.tab,
    `A${FIRST_DATA_ROW}:${LAST_COL}`,
  );
  const gap = rows.findIndex(rowIsEmpty);
  // Trailing empty rows are not returned at all, so no gap means append.
  return FIRST_DATA_ROW + (gap === -1 ? rows.length : gap);
}

/** Refuses free text the tracking tab would run as a formula. Checked here,
 *  at the write, so no caller can skip it. */
function assertNoFormula(
  fields: Partial<WorkItem>,
  when: "create" | "update",
): void {
  const problem = formulaProblem(fields, when);
  if (problem) throw new SheetError(problem.message, 400);
}

export async function createItem(item: WorkItem): Promise<WorkItem> {
  assertNoFormula(item, "create");
  const c = await ctx();
  await ensureHeaders(c);

  // Derive the reference from the sheet rather than the caller's board, so
  // two people adding at the same time cannot both claim the same number.
  const ids = await readRange(
    c.config,
    c.tab,
    `${COLS.id}${FIRST_DATA_ROW}:${COLS.id}`,
  );
  const highest = ids.reduce((max, r) => {
    const m = /^MON-(\d+)$/.exec(str(r?.[0]));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  const saved: WorkItem = {
    ...item,
    ref: highest + 1,
    id: `MON-${highest + 1}`,
    updatedAt: new Date().toISOString(),
  };
  const row = await nextFreeRow(c);
  await writeRanges(c.config, c.tab, [
    { a1: `A${row}:${LAST_COL}${row}`, values: [itemToRow(saved, c.team)] },
  ]);
  return { ...saved, sheetRow: row };
}

/** One item as the sheet has it now. */
export async function getItem(id: string): Promise<WorkItem> {
  const c = await ctx();
  const rowNumber = await findRow(c, id);
  const row =
    (
      await readRange(c.config, c.tab, `A${rowNumber}:${LAST_COL}${rowNumber}`)
    )[0] ?? [];
  const item = rowToItem(row, rowNumber, [], c.team);
  if (!item) throw new SheetError(`${id} row is empty.`, 409);
  return item;
}

export async function updateItem(
  id: string,
  patch: Partial<WorkItem>,
  /** When given and the sheet has moved on, the write is refused. */
  expectedUpdatedAt?: string,
  /**
   * Runs against the row as it stands, before anything is written, and
   * throws to refuse the write. Lets the route apply a permission rule that
   * needs the *current* assignee without paying for a second read — and
   * keeps this file free of any knowledge of who is signed in.
   */
  guard?: (current: WorkItem) => void,
): Promise<WorkItem> {
  assertNoFormula(patch, "update");
  const c = await ctx();
  const rowNumber = await findRow(c, id);
  const row =
    (
      await readRange(c.config, c.tab, `A${rowNumber}:${LAST_COL}${rowNumber}`)
    )[0] ?? [];

  const current = rowToItem(row, rowNumber, [], c.team);
  if (!current) throw new SheetError(`${id} row is empty.`, 409);

  guard?.(current);

  const epoch = new Date(0).toISOString();
  if (
    expectedUpdatedAt &&
    current.updatedAt !== epoch &&
    current.updatedAt !== expectedUpdatedAt
  ) {
    throw new SheetError(
      `${id} was changed in the sheet while you were editing it.`,
      409,
      "Reload the board to pick up the other change.",
    );
  }

  const next: WorkItem = {
    ...current,
    ...patch,
    id: current.id,
    ref: current.ref,
    sheetRow: rowNumber,
    updatedAt: new Date().toISOString(),
  };

  await writeRanges(c.config, c.tab, [
    {
      a1: `A${rowNumber}:${LAST_COL}${rowNumber}`,
      values: [itemToRow(next, c.team)],
    },
  ]);
  return next;
}

export async function removeItem(
  id: string,
  /** Same contract as updateItem's: throw to refuse the delete. Costs one
   *  extra read, which a delete can afford. */
  guard?: (current: WorkItem) => void,
): Promise<void> {
  const c = await ctx();
  const rowNumber = await findRow(c, id);

  if (guard) {
    const row =
      (
        await readRange(c.config, c.tab, `A${rowNumber}:${LAST_COL}${rowNumber}`)
      )[0] ?? [];
    const current = rowToItem(row, rowNumber, [], c.team);
    if (current) guard(current);
  }

  await deleteRow(c.config, c.sheetId, rowNumber);
}

/**
 * Writes only the board-order column. A drag reorders a column, and
 * rewriting whole rows for that would clobber any cell edited in the sheet
 * in the meantime.
 */
export async function saveOrder(items: WorkItem[]): Promise<void> {
  const c = await ctx();
  const [header, ids] = await readRanges(c.config, c.tab, [
    HEADER_ROW,
    `${COLS.id}${FIRST_DATA_ROW}:${COLS.id}`,
  ]);
  assertColumns(c, header[0] ?? []);
  const rowById = new Map<string, number>();
  ids.forEach((r, i) => {
    const v = str(r?.[0]);
    if (v) rowById.set(v, FIRST_DATA_ROW + i);
  });

  const updates = items
    .filter((i) => rowById.has(i.id))
    .map((i) => ({
      a1: `${COLS.order}${rowById.get(i.id)}`,
      values: [[i.order]],
    }));

  await writeRanges(c.config, c.tab, updates);
}

export { SheetError };
