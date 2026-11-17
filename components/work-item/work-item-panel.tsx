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
import { useTracker } from "@/lib/store";
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
  // Title, description, notes, and story points are held locally so every
  // keystroke does not become a write to the sheet. Menus and dates write
  // as soon as they change. Save, and leaving a text field, send whatever
  // of that text is ready — an empty description does not throw away a
  // note you already typed.
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes);
  const [storyPoints, setStoryPoints] = useState(
    item.storyPoints !== null && item.storyPoints !== undefined
      ? String(item.storyPoints)
      : "",
  );
  const sync = useTracker((s) => s.sync);
  const saveError = useTracker((s) => (s.sync === "error" ? s.error : null));

  const titleProblem = workItemFieldProblem({ title }, "update");
  const descriptionProblem = workItemFieldProblem({ description }, "update");
  const notesProblem = workItemFieldProblem({ notes }, "update");
  const endDateProblem = workItemFieldProblem(
    { plannedDate: item.plannedDate },
    "update",
  );
  const assigneeProblem = workItemFieldProblem(
    { assigneeId: item.assigneeId },
    "update",
  );
  const assignedByProblem = workItemFieldProblem(
    { secondaryAssigneeId: item.secondaryAssigneeId },
    "update",
  );
  const productProblem = workItemFieldProblem({ type: item.type }, "update");

  const patch = (p: Partial<WorkItem>) => onPatch(item.id, p);
  const overdue = isOverdue(item);

  const textPatch = (): Partial<WorkItem> => {
    const next: Partial<WorkItem> = {};
    const nextTitle = title.trim();
    if (
      nextTitle &&
      nextTitle !== item.title &&
      !workItemFieldProblem({ title: nextTitle }, "update")
    ) {
      next.title = nextTitle;
    }
    const nextDescription = description.trim();
    if (
      nextDescription &&
      nextDescription !== item.description &&
      !workItemFieldProblem({ description: nextDescription }, "update")
    ) {
      next.description = nextDescription;
    }
    if (notes !== item.notes && !workItemFieldProblem({ notes }, "update")) {
      next.notes = notes;
    }
    const trimmedPoints = storyPoints.trim();
    if (!trimmedPoints) {
      if (item.storyPoints !== null && item.storyPoints !== undefined) {
        next.storyPoints = null;
      }
    } else {
      const parsed = parseInt(trimmedPoints, 10);
      if (
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        parsed !== item.storyPoints
      ) {
        next.storyPoints = parsed;
      }
    }
    return next;
  };

  const pending = textPatch();
  const dirty = Object.keys(pending).length > 0;

  const commit = () => {
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    if (!nextTitle) setTitle(item.title);
    if (!nextDescription) setDescription(item.description);
    const trimmedPoints = storyPoints.trim();
    if (trimmedPoints) {
      const parsed = parseInt(trimmedPoints, 10);
      if (Number.isFinite(parsed) && parsed >= 0) setStoryPoints(String(parsed));
      else {
        setStoryPoints(
          item.storyPoints !== null && item.storyPoints !== undefined
            ? String(item.storyPoints)
            : "",
        );
      }
    }
    if (dirty) patch(pending);
  };

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
          onBlur={commit}
          aria-label="Task name"
          aria-invalid={!!titleProblem}
          placeholder="Name this task"
          className="-mx-1 rounded px-1 text-[17px] leading-snug font-semibold tracking-[-0.01em] hover:bg-muted/60 focus:bg-muted/60 focus-visible:outline-none"
        />
        <FormulaError problem={titleProblem} field="title" />
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commit}
            aria-invalid={!!descriptionProblem}
            placeholder="What needs doing, and anything the next person should know."
            className="min-h-24 resize-y bg-card text-[13px] leading-relaxed"
          />
          <FormulaError problem={descriptionProblem} field="description" />
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
            <FormulaError problem={assigneeProblem} field="assigneeId" />
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
            <FormulaError problem={assignedByProblem} field="secondaryAssigneeId" />
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
            <FormulaError problem={productProblem} field="type" />
          </Field>
          <Field label="Story points">
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 1, 2, 3, 5"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              onBlur={commit}
              className="h-9 bg-card font-mono text-[13px]"
            />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commit}
            aria-invalid={!!notesProblem}
            placeholder="Where this has got to, blockers, anything said in passing."
            className="min-h-20 resize-y bg-card text-[13px] leading-relaxed"
          />
          <FormulaError problem={notesProblem} field="notes" />
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
                ariaInvalid={!!endDateProblem}
              />
              <FormulaError problem={endDateProblem} field="plannedDate" />
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

      <footer className="flex shrink-0 flex-col gap-2 border-t border-rule bg-muted/40 px-5 py-3">
        {saveError && (
          <p role="alert" className="text-[11.5px] text-destructive">
            {saveError}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {item.sheetRow ? `Sheet row ${item.sheetRow}` : "Not yet in sheet"}
            {" · "}
            saved {relativeTime(item.updatedAt)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[12px]"
              disabled={!dirty || sync === "syncing"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
            >
              {sync === "syncing" ? "Saving…" : "Save"}
            </Button>
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
          </div>
        </div>
      </footer>
    </>
  );
}
