"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import type { LogEntry } from "@/lib/audit";
import { formatLong, relativeTime } from "@/lib/dates";
import { repository } from "@/lib/repositories";
import { cn } from "@/lib/utils";

/**
 * A task's change log, in its detail panel.
 *
 * Closed until asked for. Each open reads the Log tab, which grows forever
 * and shares the sheet's rate limit with every save on the board, so it is
 * not worth spending on every card someone clicks past.
 */
export function ItemHistory({
  itemId,
  updatedAt,
}: {
  itemId: string;
  /** Changes whenever this item is saved, so an open log refreshes itself. */
  updatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[] | null | undefined>();
  const [failed, setFailed] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    // The server writes the log just after it answers the save, so reading
    // the instant updatedAt moves can miss the newest entry. The first read
    // has nothing to wait for; later ones give the entry a moment to land.
    const wait = loaded.current ? 1500 : 0;
    loaded.current = true;
    const timer = setTimeout(() => {
      repository
        .history(itemId)
        .then((e) => {
          if (!live) return;
          setEntries(e);
          setFailed(null);
        })
        .catch((e: unknown) => {
          if (live) setFailed(e instanceof Error ? e.message : "Could not load history");
        });
    }, wait);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, itemId, updatedAt, nonce]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="-mx-1 flex items-center gap-1 rounded px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
          <span className="label-mono">History</span>
        </button>
        {open && entries && (
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            aria-label="Reload history"
            className="text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <RefreshCw className="size-3" />
          </button>
        )}
      </div>

      {open && <Body entries={entries} failed={failed} />}
    </div>
  );
}

function Body({
  entries,
  failed,
}: {
  entries: LogEntry[] | null | undefined;
  failed: string | null;
}) {
  if (failed) {
    return <p className="text-[12px] text-destructive">{failed}</p>;
  }
  if (entries === undefined) {
    return <p className="text-[12px] text-muted-foreground">Loading…</p>;
  }
  if (entries === null) {
    return (
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Changes are logged once the tracking sheet is connected.
      </p>
    );
  }
  if (!entries.length) {
    return (
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Nothing logged yet. The log starts from the first change made after it
        was switched on; edits typed straight into the sheet are not seen.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {groups(entries).map((g) => (
        <li key={`${g.at}|${g.byEmail}`} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate">
              <span className="font-medium text-foreground">{g.by || "Someone"}</span>{" "}
              <span className="text-muted-foreground">
                {g.action === "created"
                  ? "created this task"
                  : g.action === "deleted"
                    ? "deleted this task"
                    : `changed ${g.changes.length === 1 ? "1 field" : `${g.changes.length} fields`}`}
              </span>
            </span>
            <time
              dateTime={g.at}
              title={new Date(g.at).toLocaleString("en-GB")}
              className="shrink-0 font-mono text-[10.5px] text-muted-foreground"
            >
              {relativeTime(g.at)}
            </time>
          </div>

          {g.action === "updated" && (
            <ul className="space-y-1 border-l border-rule pl-3">
              {g.changes.map((c) => (
                <li key={c.field} className="text-[12px] leading-snug">
                  <span className="text-muted-foreground">{c.field}:</span>{" "}
                  <Value v={c.from} muted /> <span aria-hidden className="text-muted-foreground">→</span>{" "}
                  <span className="sr-only">to</span>
                  <Value v={c.to} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function Value({ v, muted }: { v: string; muted?: boolean }) {
  if (!v) {
    return <span className="text-muted-foreground italic">blank</span>;
  }
  const text = ISO_DATE.test(v) ? formatLong(v) : v;
  return (
    <span
      title={text.length > 60 ? text : undefined}
      className={cn(
        "break-words",
        muted ? "text-muted-foreground" : "font-medium text-foreground",
      )}
    >
      {text.length > 60 ? `${text.slice(0, 60)}…` : text}
    </span>
  );
}

interface Group {
  at: string;
  by: string;
  byEmail: string;
  action: LogEntry["action"];
  changes: LogEntry[];
}

/** One save by one person is one step, however many fields it touched. */
function groups(entries: LogEntry[]): Group[] {
  const out: Group[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.at === e.at && last.byEmail === e.byEmail && last.action === e.action) {
      last.changes.push(e);
    } else {
      out.push({ at: e.at, by: e.by, byEmail: e.byEmail, action: e.action, changes: [e] });
    }
  }
  return out;
}
