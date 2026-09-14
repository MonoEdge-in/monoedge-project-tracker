import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { AuthError, isAdmin, requireMember } from "@/lib/server/session";

export const metadata = { title: "Analytics · MonoEdge Tracker" };

/**
 * Delivery analytics. Admins only, and decided here on the server — the
 * Analytics link in the top bar is only an offer.
 *
 * Belt and braces with the data: /api/items already hands a developer
 * nothing but their own work, so a developer who got past this page would
 * see a report about themselves. The check is still here because "admins
 * only" should mean the page, not merely the numbers on it.
 */
export default async function AnalyticsPage() {
  let admin = false;
  try {
    admin = isAdmin(await requireMember());
  } catch (e) {
    // redirect() works by throwing, so it must never sit inside the try it
    // would be caught by. From the catch block it escapes cleanly.
    if (!(e instanceof AuthError)) throw e;
    if (e.status === 403) redirect("/no-access?reason=revoked");
    redirect("/sign-in?next=/analytics");
  }

  if (!admin) redirect("/");

  return <AnalyticsDashboard />;
}
