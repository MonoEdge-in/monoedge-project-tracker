import { buildReport, daysBefore, daysBetween, measure } from "../lib/analytics";
import type { Member, Status, WorkItem } from "../lib/types";

let pass = 0;
let fail = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}\n      expected ${e}\n      got      ${a}`);
  }
};

const TODAY = "2026-09-14";

let ref = 0;
const task = (
  over: Partial<WorkItem> & { status: Status },
): WorkItem => {
  ref += 1;
  return {
    id: `MON-${ref}`,
    ref,
    title: `Task ${ref}`,
    description: "",
    assigneeId: "asha",
    secondaryAssigneeId: null,
    notes: "",
    createdDate: "2026-08-01",
    startedDate: null,
    plannedDate: null,
    actualDate: null,
    priority: "Medium",
    type: null,
    storyPoints: null,
    order: ref,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
};

const kind = (i: WorkItem) => {
  const m = measure(i, TODAY);
  return m.kind === "scored" ? `${m.slip.outcome}:${m.slip.days}` : m.kind;
};

// --- Day arithmetic
check("same day", daysBetween("2026-09-14", "2026-09-14"), 0);
check("one day", daysBetween("2026-09-13", "2026-09-14"), 1);
check("across a month", daysBetween("2026-08-30", "2026-09-02"), 3);
check("backwards is negative", daysBetween("2026-09-14", "2026-09-10"), -4);
// A DST boundary in regions that observe one must still be whole days.
check("across DST", daysBetween("2026-03-28", "2026-03-30"), 2);
check("30 days before", daysBefore(TODAY, 30), "2026-08-15");

// --- Completed work
check(
  "delivered on the planned date is on time",
  kind(task({ status: "Completed", plannedDate: "2026-09-10", actualDate: "2026-09-10" })),
  "on-time:0",
);
check(
  "delivered early is on time, not negative",
  kind(task({ status: "Completed", plannedDate: "2026-09-10", actualDate: "2026-09-05" })),
  "on-time:0",
);
check(
  "delivered two days after",
  kind(task({ status: "Completed", plannedDate: "2026-09-10", actualDate: "2026-09-12" })),
  "late:2",
);
check(
  "completed with no actual date cannot be measured",
  kind(task({ status: "Completed", plannedDate: "2026-09-10" })),
  "unmeasured",
);

// --- Open work
check(
  "due today is not late yet",
  kind(task({ status: "In Progress", plannedDate: TODAY })),
  "not-due",
);
check(
  "due tomorrow is not due",
  kind(task({ status: "Yet to Start", plannedDate: "2026-09-15" })),
  "not-due",
);
check(
  "a day past, still open",
  kind(task({ status: "In Testing", plannedDate: "2026-09-13" })),
  "overdue:1",
);
check(
  "on hold past its date is parked, not scored",
  kind(task({ status: "On-hold", plannedDate: "2026-09-01" })),
  "parked",
);
check(
  "on hold and not yet due is simply not due",
  kind(task({ status: "On-hold", plannedDate: "2026-09-20" })),
  "not-due",
);
check("no planned date", kind(task({ status: "In Progress" })), "unplanned");

// --- A person's report
const team: Member[] = [
  { id: "asha", name: "Asha", initials: "A", role: "developer", color: "#1" },
  { id: "ben", name: "Ben", initials: "B", role: "developer", color: "#2" },
  { id: "gone", name: "Gone", initials: "G", role: "developer", color: "#3", active: false },
];

const items: WorkItem[] = [
  task({ status: "Completed", plannedDate: "2026-09-01", actualDate: "2026-09-01" }), // on time
  task({ status: "Completed", plannedDate: "2026-09-01", actualDate: "2026-09-04" }), // late 3
  task({ status: "In Progress", plannedDate: "2026-09-04" }), // overdue 10
  task({ status: "On-hold", plannedDate: "2026-09-02" }), // parked
  task({ status: "In Progress" }), // unplanned
  task({ status: "Yet to Start", plannedDate: "2026-09-30" }), // not due
  task({ status: "Completed", plannedDate: "2026-06-01", actualDate: "2026-06-11" }), // late 10, old
  task({ status: "In Progress", assigneeId: null, plannedDate: "2026-09-12" }), // unassigned overdue 2
  task({ status: "Completed", secondaryAssigneeId: "ben", plannedDate: "2026-09-05", actualDate: "2026-09-09" }), // late 4, Asha's not Ben's
];

const all = buildReport(items, team, { today: TODAY });
const asha = all.people.find((p) => p.memberId === "asha")!;

check("scored = on time + late + overdue", asha.due, 5);
check("on time", asha.onTime, 1);
check("delivered late", asha.late, 3);
check("still overdue", asha.overdue, 1);
check("missed", asha.missed, 4);
check("on-time rate", asha.onTimeRate, 0.2);
check("days late sum", asha.daysLate, 3 + 10 + 10 + 4);
check("average days late", asha.avgDaysLate, 27 / 4);
check("parked counted, not scored", asha.parked, 1);
check("unplanned counted, not scored", asha.unplanned, 1);
check("worst first", asha.slips.map((s) => s.days), [10, 10, 4, 3]);
// Two 10-day slips: the still-open one was raised first, so it leads.
check("ties broken by ref", asha.worst?.item.id, items[2].id);
check("not due is reported once, for everyone", all.notDue, 1);

// Secondary person is never scored.
const ben = all.people.find((p) => p.memberId === "ben")!;
check("secondary person is not scored", ben.due, 0);
check("a person with nothing due still gets a row", ben.onTimeRate, null);

// Inactive members only appear when they have work.
check(
  "inactive member with no work has no row",
  all.people.some((p) => p.memberId === "gone"),
  false,
);

const unassigned = all.people.find((p) => p.memberId === null)!;
check("unassigned work gets its own row", unassigned.overdue, 1);
check("team includes unassigned work", all.team.overdue, 2);
check("team days late", all.team.daysLate, 27 + 2);

// --- Period: filters on planned date, keeps unplanned work.
const recent = buildReport(items, team, { today: TODAY, from: "2026-08-15" });
const ashaRecent = recent.people.find((p) => p.memberId === "asha")!;
check("old late work drops out of the period", ashaRecent.late, 2);
check("period days late", ashaRecent.daysLate, 3 + 10 + 4);
check("unplanned work survives the period filter", ashaRecent.unplanned, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
