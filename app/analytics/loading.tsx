import {
  AnalyticsHeader,
  DashboardSkeleton,
} from "@/components/analytics/analytics-dashboard";

/**
 * Shown the instant Analytics is clicked.
 *
 * The page is dynamic — it checks on the server that the viewer is an admin
 * — and without a loading boundary Next waits for that check to finish
 * before changing anything on screen, so the click looked like it had done
 * nothing. With one, the header and skeleton are prefetched along with the
 * link and appear immediately.
 */
export default function AnalyticsLoading() {
  return (
    <main className="flex h-full flex-col bg-background">
      <AnalyticsHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
          <div className="h-[52px]" />
          <DashboardSkeleton />
        </div>
      </div>
    </main>
  );
}
