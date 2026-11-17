import type { WorkItem } from "./types";

/**
 * Text that would be run as a spreadsheet formula.
 *
 * The tracking tab is written with USER_ENTERED so dates land as real date
 * cells, and that same mode turns any value starting with "=" into a formula.
 * A task named =IMPORTXML(...) would fetch a URL from inside the team's
 * sheet; =HYPERLINK(...) would plant a link that looks like data. So free
 * text may not start with "=" at all.
 *
 * Refused rather than escaped. Escaping would make the cell safe, but it
 * would also make a stray "=" silently save as something other than what was
 * typed, and the rule is simple enough to state instead.
 *
 * Leading spaces do not get around it: the composer trims, so " =x" would
 * be saved as "=x".
 */

type FreeText = "title" | "description" | "notes";

export type WorkItemFieldProblem = {
  field: FreeText | "plannedDate" | "assigneeId" | "secondaryAssigneeId" | "type";
  message: string;
};

export const MAX_TITLE_WORDS = 20;

const LABEL: Record<FreeText, string> = {
  title: "A task",
  description: "A description",
  notes: "Notes",
};

export const wordCount = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export const startsLikeFormula = (value: string | null | undefined) =>
  !!value && value.trimStart().startsWith("=");

/** The first free-text field that would run as a formula, or null. */
export function formulaProblem(
  fields: Partial<Pick<WorkItem, FreeText>>,
  when: "create" | "update",
): WorkItemFieldProblem | null {
  for (const field of ["title", "description", "notes"] as const) {
    if (!startsLikeFormula(fields[field])) continue;
    const message =
      field !== "title"
        ? `${LABEL[field]} cannot start with an = sign.`
        : when === "create"
          ? "A task cannot be added with an = sign at the start."
          : "A task name cannot start with an = sign.";
    return { field, message };
  }
  return null;
}

/**
 * Validation for the fields people edit when adding or updating work. Formula
 * text is checked first. On create, every required field must be present.
 * On update, only the fields actually passed in are judged — a blank one
 * among them is refused, and a field left out of the patch is left alone.
 * Callers must pass the patch, not the merged row: old sheet rows are missing
 * description, end date, people, or product, and folding those blanks into
 * every write blocks a date change on a card that otherwise looks filled in.
 */
export function workItemFieldProblem(
  fields: Partial<
    Pick<
      WorkItem,
      | FreeText
      | "plannedDate"
      | "assigneeId"
      | "secondaryAssigneeId"
      | "type"
    >
  >,
  when: "create" | "update",
): WorkItemFieldProblem | null {
  const formula = formulaProblem(fields, when);
  if (formula) return formula;

  const requireAll = when === "create";
  const title = fields.title;
  const description = fields.description;
  const plannedDate = fields.plannedDate;

  if (title !== undefined || requireAll) {
    const trimmed = (title ?? "").trim();
    if (!trimmed) {
      return {
        field: "title",
        message:
          when === "create"
            ? "A task name is required."
            : "A task name cannot be empty.",
      };
    }
    if (wordCount(title ?? "") > MAX_TITLE_WORDS) {
      return {
        field: "title",
        message: `A task name cannot be more than ${MAX_TITLE_WORDS} words.`,
      };
    }
  }

  if (description !== undefined || requireAll) {
    if (!(description ?? "").trim()) {
      return {
        field: "description",
        message: "Description is required.",
      };
    }
  }

  if (plannedDate !== undefined || requireAll) {
    if (!plannedDate) {
      return {
        field: "plannedDate",
        message: "End date is required.",
      };
    }
  }

  if (fields.assigneeId !== undefined || requireAll) {
    if (!fields.assigneeId) {
      return {
        field: "assigneeId",
        message: "Primary person is required.",
      };
    }
  }

  if (fields.secondaryAssigneeId !== undefined || requireAll) {
    if (!fields.secondaryAssigneeId) {
      return {
        field: "secondaryAssigneeId",
        message: "Assigned by is required.",
      };
    }
  }

  if (fields.type !== undefined || requireAll) {
    if (!fields.type) {
      return {
        field: "type",
        message: "Product is required.",
      };
    }
  }

  return null;
}

/**
 * The update check. Only keys this write is setting are examined, so moving
 * a card or changing its end date is not refused because some other required
 * field was never filled in on an older row. Clearing one of those fields
 * is still refused, because the key is present and the value is empty.
 */
export function problemForPatch(
  patch: Partial<WorkItem>,
): WorkItemFieldProblem | null {
  return workItemFieldProblem(
    {
      ...("title" in patch ? { title: patch.title } : {}),
      ...("description" in patch ? { description: patch.description } : {}),
      ...("notes" in patch ? { notes: patch.notes } : {}),
      ...("plannedDate" in patch ? { plannedDate: patch.plannedDate } : {}),
      ...("assigneeId" in patch ? { assigneeId: patch.assigneeId } : {}),
      ...("secondaryAssigneeId" in patch
        ? { secondaryAssigneeId: patch.secondaryAssigneeId }
        : {}),
      ...("type" in patch ? { type: patch.type } : {}),
    },
    "update",
  );
}
