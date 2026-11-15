"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { dueLabel, isOverdue, relativeTime } from "@/lib/dates";
import type { WorkItem } from "@/lib/types";
import { StatusChip, WorkItemRef } from "@/components/shared/badges";
import { workItemFieldProblem } from "@/lib/validation";
import {
  AssigneeSelect,
  FormulaError,
  DateField,
  Field,
  PrioritySelect,
  StatusSelect,
  TypeSelect,
} from "./controls";
import { ItemHistory } from "./item-history";

export function WorkItemPanel({
  item,
  onClose,
  onPatch,
  onDelete,
}: {
  item: WorkItem | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<WorkItem>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        // Without this the panel opens with the whole task name selected,
        // one keystroke away from wiping it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        {item && (
          // Keyed by id so switching cards starts with that card's text,
          // rather than syncing local state from props in an effect.
          <PanelBody
            key={item.id}
            item={item}
            onPatch={onPatch}
            onDelete={onDelete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  item,
  onPatch,
  onDelete,
}: {
  item: WorkItem;
  onPatch: (id: string, patch: Partial<WorkItem>) => void;
  onDelete: (id: string) => void;
}) {
  // Title and description are held locally and committed on blur so every
  // keystroke does not become a write to the sheet.
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes);

  // Checked live against what is typed. A field with the problem is simply
  // not saved on blur: the text stays put, with the reason under it, so the
  // fix is one keystroke rather than retyping.
  const fieldProblem = workItemFieldProblem(
    {
      title,
      description,
      notes,
      plannedDate: item.plannedDate,
      assigneeId: item.assigneeId,
      secondaryAssigneeId: item.secondaryAssigneeId,
      type: item.type,
    },
    "update",
  );
  const blocked = (
    field:
      | "title"
      | "description"
      | "notes"
      | "plannedDate"
      | "assigneeId"
      | "secondaryAssigneeId"
      | "type",
  ) => fieldProblem?.field === field;
  const [storyPoints, setStoryPoints] = useState(
    item.storyPoints !== null && item.storyPoints !== undefined
      ? String(item.storyPoints)
      : "",
  );

  const patch = (p: Partial<WorkItem>) => onPatch(item.id, p);
  const overdue = isOverdue(item);

  return (
    <>
      <SheetHeader className="shrink-0 gap-2 border-b border-rule px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <WorkItemRef refNumber={item.ref} />
          <StatusChip status={item.status} />
        </div>
        <SheetTitle className="sr-only">{item.title}</SheetTitle>
        <SheetDescription className="sr-only">
          Edit work item MON-{item.ref}
        </SheetDescription>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (blocked("title")) return;
            const next = title.trim();
            if (next && next !== item.title) patch({ title: next });
            else if (!next) setTitle(item.title);
          }}
          aria-label="Task name"
          aria-invalid={blocked("title")}
          placeholder="Name this task"
          className="-mx-1 rounded px-1 text-[17px] leading-snug font-semibold tracking-[-0.01em] hover:bg-muted/60 focus:bg-muted/60 focus-visible:outline-none"
        />
        <FormulaError problem={fieldProblem} field="title" />
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (blocked("description")) return;
              const next = description.trim();
              if (!next) {
                setDescription(item.description);
                return;
              }
              if (next !== item.description) patch({ description: next });
            }}
            aria-invalid={blocked("description")}
            placeholder="What needs doing, and anything the next person should know."
            className="min-h-24 resize-y bg-card text-[13px] leading-relaxed"
          />
          <FormulaError problem={fieldProblem} field="description" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <StatusSelect
              value={item.status}
              onChange={(status) => patch({ status })}
            />
          </Field>
          <Field label="Primary person">
            <AssigneeSelect
              value={item.assigneeId}
              onChange={(assigneeId) => {
                if (!assigneeId) return;
                patch({ assigneeId });
              }}
              allowEmpty={false}
            />
            <FormulaError problem={fieldProblem} field="assigneeId" />
          </Field>
          <Field label="Priority">
            <PrioritySelect
              value={item.priority}
              onChange={(priority) => patch({ priority })}
            />
          </Field>
          <Field label="Assigned by">
            <AssigneeSelect
              label="Assigned by"
              value={item.secondaryAssigneeId}
              onChange={(secondaryAssigneeId) => {
                if (!secondaryAssigneeId) return;
                patch({ secondaryAssigneeId });
              }}
              allowEmpty={false}
            />
            <FormulaError problem={fieldProblem} field="secondaryAssigneeId" />
          </Field>
          <Field label="Product">
            <TypeSelect
              value={item.type}
              onChange={(type) => {
                if (!type) return;
                patch({ type });
              }}
              allowEmpty={false}
            />
            <FormulaError problem={fieldProblem} field="type" />
          </Field>
          <Field label="Story points">
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 1, 2, 3, 5"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              onBlur={() => {
                const trimmed = storyPoints.trim();
                if (!trimmed) {
                  if (item.storyPoints !== null) patch({ storyPoints: null });
                } else {
                  const parsed = parseInt(trimmed, 10);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    setStoryPoints(String(parsed));
                    if (parsed !== item.storyPoints) patch({ storyPoints: parsed });
                  } else {
                    setStoryPoints(
                      item.storyPoints !== null && item.storyPoints !== undefined
                        ? String(item.storyPoints)
                        : "",
                    );
                  }
                }
              }}
              className="h-9 bg-card font-mono text-[13px]"
            />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (blocked("notes")) return;
              if (notes !== item.notes) patch({ notes });
            }}
            aria-invalid={blocked("notes")}
            placeholder="Where this has got to, blockers, anything said in passing."
            className="min-h-20 resize-y bg-card text-[13px] leading-relaxed"
          />
          <FormulaError problem={fieldProblem} field="notes" />
        </Field>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="label-mono text-muted-foreground">Dates</span>
            <span
              className={cn(
                "font-mono text-[10.5px]",
                overdue
                  ? "font-semibold text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {dueLabel(item.plannedDate)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Created"
              value={item.createdDate}
              onChange={(createdDate) => patch({ createdDate })}
            />
            <DateField
              label="Started"
              value={item.startedDate}
              onChange={(startedDate) => patch({ startedDate })}
              readOnlyHint="auto"
            />
            <div className="space-y-0">
              <DateField
                label="End date"
                value={item.plannedDate}
                onChange={(plannedDate) => {
                  if (!plannedDate) return;
                  patch({ plannedDate });
                }}
                ariaInvalid={blocked("plannedDate")}
              />
              <FormulaError problem={fieldProblem} field="plannedDate" />
            </div>
            <DateField
              label="Actual"
              value={item.actualDate}
              onChange={(actualDate) => patch({ actualDate })}
              readOnlyHint="auto"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Started and Actual stamp themselves when you move the card into
            In&nbsp;Progress or Completed. Override either here.
          </p>
        </div>

        <Separator />

        <ItemHistory itemId={item.id} updatedAt={item.updatedAt} />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-rule bg-muted/40 px-5 py-3">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {item.sheetRow ? `Sheet row ${item.sheetRow}` : "Not yet in sheet"}
          {" · "}
          saved {relativeTime(item.updatedAt)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            onDelete(item.id);
            toast(`MON-${item.ref} deleted`, {
              description: item.title,
            });
          }}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </footer>
    </>
  );
}
