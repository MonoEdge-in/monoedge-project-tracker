import { after, type NextRequest } from "next/server";
import { diffItems, entriesFor } from "@/lib/audit";
import { recordChanges } from "@/lib/server/log-store";
import { removeItem, updateItem } from "@/lib/server/sheet-store";
import { loadTeam } from "@/lib/server/team-store";
import {
  AuthError,
  assertCanEdit,
  isAdmin,
  requireMember,
} from "@/lib/server/session";
import { actorOf, fail } from "../route";
import type { WorkItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const member = await requireMember();
    const { id } = await params;
    const body = (await request.json()) as {
      patch: Partial<WorkItem>;
      /** When present, the write is refused if the sheet has moved on. */
      expectedUpdatedAt?: string;
    };
    const patch = body.patch ?? {};

    // Reassigning work away from yourself is a scheduling call, so it stays
    // with admins even on a row you are otherwise allowed to edit.
    if (
      !isAdmin(member) &&
      patch.assigneeId !== undefined &&
      patch.assigneeId !== member.id
    ) {
      throw new AuthError(
        "You cannot reassign work to someone else.",
        403,
        "An admin can move it.",
      );
    }

    // The guard already receives the row as it stood before the write, which
    // is exactly the "from" side of the change log. Captured here rather than
    // re-read, so logging costs no extra call.
    let before: WorkItem | undefined;
    const saved = await updateItem(id, patch, body.expectedUpdatedAt, (current) => {
      assertCanEdit(member, current);
      before = current;
    });

    // Scheduled only now the save has succeeded: after() also runs for
    // failed responses, and a refused write must leave no trace in the log.
    after(async () => {
      if (!before) return;
      const changes = diffItems(before, saved, await loadTeam());
      await recordChanges(
        entriesFor("updated", actorOf(member), saved, changes),
      );
    });

    return Response.json(saved);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const member = await requireMember();
    const { id } = await params;
    let before: WorkItem | undefined;
    await removeItem(id, (current) => {
      assertCanEdit(member, current);
      before = current;
    });

    after(async () => {
      if (before) await recordChanges(entriesFor("deleted", actorOf(member), before));
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    return fail(e);
  }
}
