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

const LABEL: Record<FreeText, string> = {
  title: "A task",
  description: "A description",
  notes: "Notes",
};

export const startsLikeFormula = (value: string | null | undefined) =>
  !!value && value.trimStart().startsWith("=");

/** The first free-text field that would run as a formula, or null. */
export function formulaProblem(
  fields: Partial<Pick<WorkItem, FreeText>>,
  when: "create" | "update",
): { field: FreeText; message: string } | null {
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
