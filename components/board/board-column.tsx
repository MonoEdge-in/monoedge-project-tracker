"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BoardColumnDef } from "@/lib/constants";
import type { ColumnDateSort } from "@/lib/store";
import type { Status, WorkItem } from "@/lib/types";
import { SortableWorkItemCard } from "./work-item-card";

export function BoardColumn({
  column,
  /** Droppable key owned by the board — `columnId__lane`. */
  dropId,
  items,
  onOpen,
  onAdd,
  onStatus,
  isDropTarget,
  dateSort,
  onToggleDateSort,
  enterIndex = 0,
  /** Swimlane mode: empty columns collapse instead of holding a full height. */
  dense = false,
}: {
  column: BoardColumnDef;
  dropId: string;
  items: WorkItem[];
  onOpen: (id: string) => void;
  onAdd: (column: BoardColumnDef) => void;
  onStatus: (id: string, status: Status) => void;
  isDropTarget: boolean;
  dateSort: ColumnDateSort | null;
  onToggleDateSort: () => void;
  enterIndex?: number;
  dense?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: dropId,
    data: { type: "column", columnId: column.id },
  });
  const empty = items.length === 0;
  const canAdd = column.id === "yet-to-start";
  const SortIcon =
    dateSort === "asc" ? ArrowUp : dateSort === "desc" ? ArrowDown : ArrowUpDown;
  const sortLabel =
    dateSort === "asc"
      ? "Sorted by date, oldest first. Click for newest first."
      : dateSort === "desc"
        ? "Sorted by date, newest first. Click for manual order."
        : column.id === "completed"
          ? "Sort by finish date"
          : "Sort by end date";

  return (
    <motion.section
      data-column={column.id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.48,
        delay: enterIndex * 0.055,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "flex flex-col",
        dense
          ? // Swimlanes: every lane must line its stages up with every other
            // lane, so the width is fixed and the row scrolls as one.
            "h-auto w-[276px] shrink-0"
          : // Flat: share the viewport out between the stages, down to a
            // floor where a card stops being readable — 236px, which is exactly
            // what lets five columns fit a 1280 laptop. Past that the board
            // scrolls rather than squeezing further, so a laptop gets five
            // usable columns and a wide monitor gets no dead margin.
            "h-full min-w-[236px] flex-1 basis-0",
      )}
      aria-label={`${column.label}, ${items.length} items`}
    >
      {/* Header: the colour rule is the only status signal on the board */}
      <div className="shrink-0 rounded-t-lg border border-b-0 border-rule bg-card">
        <div
          aria-hidden
          className="h-[3px] rounded-t-[7px]"
          style={{ background: column.color }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <h2 className="label-mono min-w-0 truncate text-foreground">
                {column.label}
              </h2>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-56">
              {column.hint}
            </TooltipContent>
          </Tooltip>

          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleDateSort}
                  aria-label={sortLabel}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md px-1 font-mono text-[11px] font-semibold tabular transition-colors",
                    "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    dateSort && "bg-muted/60 text-foreground",
                  )}
                >
                  <span className={empty ? "text-muted-foreground/50" : undefined}>
                    {items.length}
                  </span>
                  <SortIcon className="size-3 shrink-0 opacity-70" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{sortLabel}</TooltipContent>
            </Tooltip>
            {canAdd ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => onAdd(column)}
                aria-label={`Add a work item to ${column.label}`}
              >
                <Plus className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-col gap-2 overflow-y-auto rounded-b-lg border border-t-0 border-rule bg-canvas p-2 transition-colors duration-150",
          dense ? "min-h-[46px]" : "flex-1",
          isDropTarget && "border-primary/45 bg-brand-tint",
        )}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableWorkItemCard
              key={item.id}
              item={item}
              onOpen={onOpen}
              onStatus={onStatus}
            />
          ))}
        </SortableContext>

        {empty &&
          (dense ? (
            // In swimlanes an empty stage is the common case, so it stays a
            // quiet strip rather than repeated invitations to add work.
            canAdd ? (
              <button
                type="button"
                onClick={() => onAdd(column)}
                aria-label={`Add a work item to ${column.label}`}
                className={cn(
                  "h-[30px] w-full rounded-md border border-dashed border-rule-strong/50 text-[11px] text-transparent transition-colors",
                  "hover:border-primary/40 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isDropTarget && "border-primary/50 text-muted-foreground",
                )}
              >
                {isDropTarget ? "Drop here" : "Add"}
              </button>
            ) : (
              <div
                aria-hidden={!isDropTarget}
                className={cn(
                  "h-[30px] w-full rounded-md border border-dashed border-rule-strong/50",
                  isDropTarget && "text-center text-[11px] text-muted-foreground",
                )}
              >
                {isDropTarget ? "Drop here" : null}
              </div>
            )
          ) : canAdd ? (
            <button
              type="button"
              onClick={() => onAdd(column)}
              className={cn(
                "flex min-h-24 w-full flex-1 items-center justify-center rounded-md border border-dashed border-rule-strong/60 text-[11px] text-muted-foreground transition-colors",
                "hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              {isDropTarget ? "Drop here" : "Nothing here — add one"}
            </button>
          ) : (
            <div
              className={cn(
                "flex min-h-24 w-full flex-1 items-center justify-center rounded-md border border-dashed border-rule-strong/60 text-[11px] text-muted-foreground",
                isDropTarget && "border-primary/50 bg-brand-tint",
              )}
            >
              {isDropTarget ? "Drop here" : "Nothing here"}
            </div>
          ))}
      </div>
    </motion.section>
  );
}
