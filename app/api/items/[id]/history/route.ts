import type { NextRequest } from "next/server";
import { readHistory } from "@/lib/server/log-store";
import { getItem } from "@/lib/server/sheet-store";
import { AuthError, requireMember, visibleTo } from "@/lib/server/session";
import { fail } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One task's change log, newest first.
 *
 * Readable by anyone who can see the task itself — the same rule the board
 * uses — so a developer cannot read the history of work they cannot see.
 * The whole team's log is the Log tab in the sheet.
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const member = await requireMember();
    const { id } = await params;

    const item = await getItem(id);
    if (!visibleTo(member, [item]).length) {
      throw new AuthError("That task is not yours to view.", 403);
    }

    return Response.json({ entries: await readHistory(id) });
  } catch (e) {
    return fail(e);
  }
}
