import { diffItems, entriesFor } from "../lib/audit";
import type { Member, WorkItem } from "../lib/types";

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

const team: Member[] = [
  { id: "vismay", name: "Vismay Rathod", initials: "VR", role: "admin", color: "#1" },
  { id: "tushar", name: "Tushar", initials: "T", role: "developer", color: "#2" },
];

const base: WorkItem = {
  id: "MON-7",
  ref: 7,
  title: "Rate limit the public API",
  description: "",
  assigneeId: "vismay",
  secondaryAssigneeId: null,
  status: "In Progress",
  notes: "",
  createdDate: "2026-09-01",
  startedDate: "2026-09-02",
  plannedDate: "2026-09-10",
  actualDate: null,
  priority: "High",
  type: null,
  storyPoints: 3,
  sheetRow: 8,
  order: 2,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

const diff = (patch: Partial<WorkItem>) =>
  diffItems(base, { ...base, ...patch }, team);

// --- What counts
check("identical items: nothing", diff({}), []);
check("planned date moved", diff({ plannedDate: "2026-09-17" }), [
  { field: "Planned date", from: "2026-09-10", to: "2026-09-17" },
]);
check("primary person logged by name", diff({ assigneeId: "tushar" }), [
  { field: "Primary person", from: "Vismay Rathod", to: "Tushar" },
]);
check("secondary person added", diff({ secondaryAssigneeId: "tushar" }), [
  { field: "Secondary person", from: "", to: "Tushar" },
]);
check("someone no longer on the roster still prints", diff({ assigneeId: "ghost" }), [
  { field: "Primary person", from: "Vismay Rathod", to: "ghost" },
]);
check("planned date cleared", diff({ plannedDate: null }), [
  { field: "Planned date", from: "2026-09-10", to: "" },
]);
check("story points", diff({ storyPoints: 5 }), [
  { field: "Story points", from: "3", to: "5" },
]);

// --- What does not
check("board order is not a change", diff({ order: 9 }), []);
check("updatedAt is not a change", diff({ updatedAt: "2026-09-11T00:00:00.000Z" }), []);
check("row number is not a change", diff({ sheetRow: 40 }), []);
check("blank to blank is not a change", diff({ notes: "" }), []);

// --- Several at once, in reading order: who and when before what.
check(
  "moving to Completed logs status and the stamped date together",
  diff({ status: "Completed", actualDate: "2026-09-12" }).map((c) => c.field),
  ["Status", "Actual date"],
);
check(
  "person before title",
  diff({ title: "Rate limit it", assigneeId: "tushar" }).map((c) => c.field),
  ["Primary person", "Task"],
);

// --- Entries
const actor = { name: "Vismay Rathod", email: "vismay@monoedge.in" };
const at = "2026-09-15T05:00:00.000Z";

check("created is one row, no field", entriesFor("created", actor, base, [], at), [
  { at, itemId: "MON-7", title: base.title, action: "created", by: actor.name, byEmail: actor.email, field: "", from: "", to: "" },
]);
check(
  "an update is one row per field",
  entriesFor("updated", actor, base, diff({ plannedDate: "2026-09-17", assigneeId: "tushar" }), at).length,
  2,
);
check(
  "an update that changed nothing writes nothing",
  entriesFor("updated", actor, base, [], at),
  [],
);
check(
  "deleted is one row and keeps the title",
  entriesFor("deleted", actor, base, [], at).map((e) => [e.action, e.title]),
  [["deleted", base.title]],
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
