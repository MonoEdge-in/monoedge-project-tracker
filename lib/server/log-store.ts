import "server-only";

import { str } from "@/lib/sheet-mapping";
import type { LogAction, LogEntry } from "@/lib/audit";
import {
  addTab,
  appendRows,
  getTab,
  readConfig,
  readRange,
  SheetError,
  writeRanges,
} from "./sheets";

/**
 * The change log: a `Log` tab in the same spreadsheet, one row per change,
 * append-only. Created on first use, so a deploy needs no manual setup.
 *
 * Only changes made *through the app* reach it. Someone typing straight into
 * the tracking tab bypasses the app entirely, and nothing here can see that.
 *
 * Read it in the sheet for the whole team's activity — filter on By, Field
 * or Item ID — or in a task's detail panel for that task alone.
 */

export const LOG_TAB = "Log";

const HEADERS = [
  "When (UTC)",
  "Item ID",
  "Task",
  "Action",
  "Field",
  "From",
  "To",
  "By",
  "By Email",
];
const LAST_COL = "I";

/**
 * Whether the tab and its headers are known to exist in this warm instance.
 * Saves two calls on every write; a cold start checks once.
 */
let ready = false;

async function ensureTab() {
  const config = readConfig();
  if (ready) return config;

  try {
    // Fresh: this runs once per warm instance, and another instance may have
    // created the tab since the cached list was taken.
    await getTab({ ...config, tabName: LOG_TAB }, { fresh: true });
  } catch (e) {
    // getTab reports a missing tab as a 404. Anything else is a real
    // failure — auth, quota — and creating a tab would not fix it.
    if (!(e instanceof SheetError) || e.status !== 404) throw e;
    await addTab(config, LOG_TAB);
  }

  const header = (await readRange(config, LOG_TAB, `A1:${LAST_COL}1`))[0] ?? [];
  if (!str(header[0])) {
    await writeRanges(config, LOG_TAB, [
      { a1: `A1:${LAST_COL}1`, values: [HEADERS] },
    ]);
  }

  ready = true;
  return config;
}

const toRow = (e: LogEntry) => [
  e.at,
  e.itemId,
  e.title,
  e.action,
  e.field,
  e.from,
  e.to,
  e.by,
  e.byEmail,
];

/**
 * Appends entries. Never throws.
 *
 * The change it describes has already been written by the time this runs,
 * and it is deliberately that way round: logging first would leave a record
 * blaming someone for a change that then failed to save. So a logging
 * failure cannot be allowed to report the save as failed either — the board
 * would roll back an edit that is really in the sheet. It is written to the
 * server log in full instead, where it can be recovered.
 */
export async function recordChanges(entries: LogEntry[]): Promise<void> {
  if (!entries.length) return;
  try {
    const config = await ensureTab();
    await appendRows(config, LOG_TAB, entries.map(toRow));
  } catch (e) {
    ready = false;
    console.error(
      "[tracker] change log write failed; entries follow",
      e instanceof Error ? e.message : e,
      JSON.stringify(entries),
    );
  }
}

/**
 * One task's history, newest first. Fields changed in the same save share a
 * timestamp and keep the order they were logged in, so a save that moved
 * Status and stamped Actual date reads as one step, in the same order.
 */
export async function readHistory(itemId: string): Promise<LogEntry[]> {
  const config = await ensureTab();
  const rows = await readRange(config, LOG_TAB, `A2:${LAST_COL}`);

  const entries: LogEntry[] = rows
    .filter((r) => str(r[1]) === itemId)
    .map((r) => ({
      at: str(r[0]),
      itemId: str(r[1]),
      title: str(r[2]),
      action: str(r[3]) as LogAction,
      field: str(r[4]),
      from: str(r[5]),
      to: str(r[6]),
      by: str(r[7]),
      byEmail: str(r[8]),
    }));

  // Array sort is stable, so equal timestamps keep their logged order.
  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
