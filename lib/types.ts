/**
 * Domain model. Every field maps 1:1 to a column in the Monoedge tracking
 * sheet so the Google Sheets adapter is a straight column<->field mapping
 * with no reshaping. Column letters are noted against each field.
 */

/**
 * The fine-grained status, exactly as it must appear in the sheet's Status
 * dropdown. The board groups several of these into one column (see COLUMNS
 * in constants.ts) but the precise status is never lost — it stays settable
 * on the card and in the detail panel.
 */
export const STATUSES = [
  "Yet to Start",
  "In Progress",
  "PR Created",
  "In Testing",
  "Completed",
  "On-hold",
] as const;

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

/** Matches the Product dropdown in column L of the tracking sheet. */
export const PRODUCTS = [
  "Kaagaz",
  "Soch",
  "Business Brain",
  "Internal",
  "Computer Vision",
] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Product = (typeof PRODUCTS)[number];

/** @deprecated Use Product */
export type WorkType = Product;
/** @deprecated Use PRODUCTS */
export const WORK_TYPES = PRODUCTS;

/** ISO date, yyyy-mm-dd. Null means the cell is blank in the sheet. */
export type IsoDate = string;

export interface WorkItem {
  /** Stable internal key. Never shown. */
  id: string;
  /** Human reference rendered as MON-<ref>. Not a sheet column — the sheet
   *  has no ID column, so this is assigned on import and held in the app. */
  ref: number;
  /** Col A — Tasks */
  title: string;
  /** Col B — Description */
  description: string;
  /** Col C — Primary Person. Holds a Member.id, or null when unassigned. */
  assigneeId: string | null;
  /** Col D — Secondary Person in the sheet; shown as Assigned by. Who raised
   *  or handed off the work — distinct from Primary Person. */
  secondaryAssigneeId: string | null;
  /** Col E — Status */
  status: Status;
  /** Col F — Notes. Free text, kept apart from Description: the description
   *  says what the task is, notes say what has happened since. */
  notes: string;
  /** Col G — Task Creation Date */
  createdDate: IsoDate | null;
  /** Col H — Task Started Date */
  startedDate: IsoDate | null;
  /** Col I — Task Planned Date (the due date) */
  plannedDate: IsoDate | null;
  /** Col J — Task Actual Date (when it actually landed) */
  actualDate: IsoDate | null;
  /** Col K — Priority */
  priority: Priority;
  /** Col L — Product */
  type: Product | null;
  /** Col R — Story Points (integer estimation, null when unestimated) */
  storyPoints: number | null;

  /** 1-based row this item occupies in the sheet. Set by the Sheets adapter
   *  so an update writes back to the right row; undefined until synced. */
  sheetRow?: number;
  /** Local ordering within a board column. */
  order: number;
  updatedAt: string;
}

/**
 * What someone is allowed to see and change.
 *
 * `admin` sees the whole board. `developer` sees only work assigned to them,
 * plus anything unassigned so a backlog item can still be picked up, and may
 * only edit their own rows. Enforced on the server in lib/server/session.ts —
 * the client filter is a convenience, never the boundary.
 */
export type Role = "admin" | "developer";

export interface Member {
  id: string;
  name: string;
  initials: string;
  role: Role;
  /**
   * Work email. Two jobs: matching a Primary Person cell someone typed by
   * hand, and mapping a signed-in Google account to this person.
   *
   * It is no longer a guest list — anyone holding an @monoedge.in Workspace
   * account can sign in, and is appended to the Team tab on arrival. Blank
   * here means a placeholder row waiting to be claimed on first sign-in.
   */
  email?: string;
  /** Colour used for the avatar chip so people are recognisable at a glance. */
  color: string;
  /**
   * Revocation that does not need IT. Suspending the Google account is the
   * real offboarding; this is the switch for taking the tracker away while
   * leaving the account alone. Undefined counts as active.
   */
  active?: boolean;
}

export type NewWorkItem = Omit<
  WorkItem,
  "id" | "ref" | "order" | "updatedAt" | "createdDate"
> & { createdDate?: IsoDate | null };

export interface Filters {
  query: string;
  /** Primary person or Assigned by. A task matches if either role is one of these. */
  assigneeIds: string[];
  priorities: Priority[];
  types: Product[];
  /** Hide anything already shipped. Kept in step with a hidden Completed column. */
  hideCompleted: boolean;
  /** Board columns to leave off the board. Empty shows Yet to start, In progress, and Completed. */
  hiddenColumns: string[];
  /** Include Completed work aged off the board (see COMPLETED_ARCHIVE_AFTER_DAYS). */
  showArchived: boolean;
}

export type GroupBy = "none" | "assignee" | "product";
export type SyncState = "idle" | "syncing" | "synced" | "error";
