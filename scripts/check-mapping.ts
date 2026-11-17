import {
  checkHeaders,
  highestRef,
  itemToRow,
  parseProduct,
  resolveMember,
  rowToItem,
  toIsoDate,
  toStoryPoints,
} from "../lib/sheet-mapping";
import {
  MAX_TITLE_WORDS,
  formulaProblem,
  problemForPatch,
  workItemFieldProblem,
  wordCount,
} from "../lib/validation";
import { COMPLETED_ARCHIVE_AFTER_DAYS } from "../lib/constants";
import { boardSortDay, isArchivedCompleted } from "../lib/dates";
import { applyFilters, EMPTY_FILTERS, sortColumnByDate } from "../lib/store";
import type { WorkItem } from "../lib/types";
import type { Member } from "../lib/types";

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

// --- Sheets serial epoch. Anchors verified independently: serial 1 is
// 1899-12-31, and 45900 is 2025-08-06 in Google's own numbering.
check("serial 1", toIsoDate(1), "1899-12-31");
check("serial 25569 (unix epoch)", toIsoDate(25569), "1970-01-01");
check("serial 46240 (2026-08-06)", toIsoDate(46240), "2026-08-06");
check("serial 46253 (2026-08-19)", toIsoDate(46253), "2026-08-19");
check("blank", toIsoDate(""), null);
check("null", toIsoDate(null), null);
check("already ISO", toIsoDate("2026-08-23"), "2026-08-23");
check("garbage text", toIsoDate("sometime next week"), null);

// --- Story points parsing. Must be integer form.
check("story points integer", toStoryPoints(3), 3);
check("story points string integer", toStoryPoints("5"), 5);
check("story points string with suffix", toStoryPoints("8 pts"), 8);
check("story points zero", toStoryPoints(0), 0);
check("story points blank", toStoryPoints(""), null);
check("story points null", toStoryPoints(null), null);
check("story points negative", toStoryPoints(-2), null);
check("story points float rounded", toStoryPoints(3.2), 3);
check("story points garbage", toStoryPoints("tbd"), null);

// --- Status aliases: the sheet's current dropdown must all land somewhere.
const statusOf = (raw: string) =>
  rowToItem(["t", "", "", "", raw, "", "", "", "", "", "High", ""], 2, [])
    ?.status;

check("sheet says Testing", statusOf("Testing"), "In Testing");
check("legacy Testing done", statusOf("Testing done"), "In Testing");
check("new In testing", statusOf("In Testing"), "In Testing");
check("sheet says Define Approach", statusOf("Define Approach"), "In Progress");
check("new PR created", statusOf("PR Created"), "PR Created");
check("legacy PR review", statusOf("PR review"), "PR Created");
check("legacy Ready to Merge", statusOf("Ready to Merge"), "PR Created");
check(
  "legacy Pending Prod Push",
  statusOf("Pending Prod Push"),
  "PR Created",
);
check("sheet says Completed", statusOf("Completed"), "Completed");
check("sheet says On-hold", statusOf("On-hold"), "On-hold");
check("sheet says Yet to Start", statusOf("Yet to Start"), "Yet to Start");
check("casing and spacing", statusOf("  in  progress "), "In Progress");
check("blank defaults", statusOf(""), "Yet to Start");

const warned: string[] = [];
rowToItem(
  ["t", "", "", "", "Marinating", "", "", "", "", "", "", ""],
  7,
  warned,
);
check("unknown status warns", warned.length, 1);

// --- A row exactly as it exists in the sheet today: blank Tasks/Description/
// Person, real dates and enums, and none of the M..Q columns yet.
const real = rowToItem(
  ["", "", "", "", "In Progress", "", 46240, 46244, 46245, "", "High", ""],
  2,
  [],
);
check("blank title becomes placeholder", real?.title, "(untitled)");
check("status", real?.status, "In Progress");
check("created", real?.createdDate, "2026-08-06");
check("started", real?.startedDate, "2026-08-10");
check("planned", real?.plannedDate, "2026-08-11");
check("actual stays null", real?.actualDate, null);
check("priority", real?.priority, "High");
check("no type", real?.type, null);
check("unassigned", real?.assigneeId, null);

check("product from sheet", parseProduct("Soch"), "Soch");
check("product case insensitive", parseProduct("  business brain "), "Business Brain");
check("internal product", parseProduct("internal"), "Internal");
check("computer vision product", parseProduct("computer vision"), "Computer Vision");
check("legacy functionality not a product", parseProduct("Product Functionality"), null);
check("row number retained", real?.sheetRow, 2);

// --- Completely empty rows are skipped, not imported as ghosts.
check("empty row skipped", rowToItem(["", "", "", ""], 9, []), null);

// --- Round trip: item -> row -> item must be stable.
const item = {
  id: "MON-7",
  ref: 7,
  title: "Rate limit the public API",
  description: "One integration is hammering us.",
  assigneeId: "vismay",
  secondaryAssigneeId: "tushar",
  status: "PR Created" as const,
  notes: "Waiting on the load test before merging.",
  createdDate: "2026-08-14",
  startedDate: "2026-08-15",
  plannedDate: "2026-08-22",
  actualDate: null,
  priority: "High" as const,
  type: "Kaagaz" as const,
  storyPoints: 5,
  sheetRow: 8,
  order: 3,
  updatedAt: "2026-08-23T10:00:00.000Z",
};
const back = rowToItem(itemToRow(item), 8, []);
check("round trip id", back?.id, item.id);
check("round trip ref", back?.ref, item.ref);
check("round trip title", back?.title, item.title);
check("round trip status", back?.status, item.status);
check("round trip assignee", back?.assigneeId, item.assigneeId);
check(
  "round trip secondary",
  back?.secondaryAssigneeId,
  item.secondaryAssigneeId,
);
check("round trip notes", back?.notes, item.notes);
check("round trip planned", back?.plannedDate, item.plannedDate);
check("round trip actual null", back?.actualDate, null);
check("round trip type", back?.type, item.type);
check("round trip story points", back?.storyPoints, 5);
check("round trip order", back?.order, item.order);
check("round trip updatedAt", back?.updatedAt, item.updatedAt);
check(
  "column C is the readable name",
  itemToRow(item)[2],
  "Vismay Rathod",
);
check("column O is the stable key", itemToRow(item)[14], "vismay");
check("column D is the readable secondary name", itemToRow(item)[3], "Tushar");
check("column Q is the secondary key", itemToRow(item)[16], "tushar");
check("column R is story points", itemToRow(item)[17], 5);

// --- Reference numbering. A row with no Item ID yet carries a placeholder
// ref derived from its row number. Counting those as claimed made a fresh
// five-row sheet import as MON-6..MON-10 instead of MON-1..MON-5.
check("no ids yet", highestRef([{ id: "row-2" }, { id: "row-3" }]), 0);
check("mixed", highestRef([{ id: "MON-3" }, { id: "row-9" }]), 3);
check(
  "highest wins, not last",
  highestRef([{ id: "MON-1" }, { id: "MON-12" }, { id: "MON-4" }]),
  12,
);
check("empty sheet", highestRef([]), 0);

// --- Primary Person. The app writes full names, humans type whatever.
const team: Member[] = [
  { id: "vismay", name: "Vismay Rathod", initials: "VR", role: "admin", email: "vismay@monoedge.in", color: "#1" },
  { id: "priya-m", name: "Priya Menon", initials: "PM", role: "admin", email: "priya@monoedge.in", color: "#2" },
  { id: "priya-s", name: "Priya Shah", initials: "PS", role: "developer", email: "priyas@monoedge.in", color: "#3" },
];
const who = (cell: string, stored = "") =>
  resolveMember(cell, stored, team)?.id ?? null;

check("full name", who("Vismay Rathod"), "vismay");
check("first name only", who("Vismay"), "vismay");
check("case and spacing", who("  vismay   rathod "), "vismay");
check("initials", who("VR"), "vismay");
check("email", who("vismay@monoedge.in"), "vismay");
check("email local part", who("vismay"), "vismay");
check("blank", who(""), null);
check("stranger", who("Someone Else"), null);
// Two Priyas: a bare first name must NOT guess.
check("ambiguous first name refuses", who("Priya"), null);
check("ambiguous resolved by surname", who("Priya Menon"), "priya-m");
check("ambiguous resolved by initials", who("PS"), "priya-s");
// The stored key column wins over whatever the readable column says.
check("stored key wins", who("Priya Menon", "vismay"), "vismay");
check("unknown stored key falls back to name", who("Priya Menon", "ghost"), "priya-m");

// --- Column check. The heading row as the tracking tab has it today.
const SHEET_HEADERS = [
  "Tasks", "Description", "Primary Person", "Secondary Person", "Status",
  "Notes", "Task Creation Date", "Task Started Date", "Task Planned Date",
  "Task Actual Date", "Priority", "Product", "Item ID",
  "Board Order", "Assignee Key", "Updated At", "Secondary Key", "Story Points",
];
const cols = (h: unknown[]) => checkHeaders(h).map((p) => p.col);

check("the sheet as it is passes", cols(SHEET_HEADERS), []);
check("a brand-new sheet with no headings passes", cols([]), []);
check(
  "app columns not written yet pass",
  cols(SHEET_HEADERS.slice(0, 12)),
  [],
);
check(
  "wording and spacing are forgiven",
  cols(["TASKS", "description ", "primary  person", "Secondary person", "status",
    "notes", "Creation date", "Start date", "Due date", "Actual Date",
    "priority", "functionality/bug"]),
  [],
);

// The incident: two columns inserted, read with the old map. Replayed by
// shifting the pre-insert layout's app columns under their old letters.
const beforeInsert = [
  "Tasks", "Description", "Primary Person", "Status", "Task Creation Date",
  "Task Started Date", "Task Planned Date", "Task Actual Date", "Priority",
  "Product", "Item ID", "Board Order", "Assignee Key", "Updated At",
];
check(
  "the old layout under the new map is refused",
  checkHeaders(beforeInsert).length > 0,
  true,
);

const inserted = [...SHEET_HEADERS];
inserted.splice(4, 0, "Reviewer");
check(
  "a new column inserted mid-sheet is caught where Status lands",
  cols(inserted)[0],
  "F",
);
check(
  "an unfamiliar heading in its right place does not stop the board",
  cols(["Work item", "Details", ...SHEET_HEADERS.slice(2)]),
  [],
);
check(
  "a team heading that names another column is refused",
  cols(["Tasks", "Description", "Primary Person", "Secondary Person", "Notes"]),
  ["E"],
);

const blankInserted = [...SHEET_HEADERS];
blankInserted.splice(9, 0, "");
check(
  "a blank column inserted is caught by the column after it",
  cols(blankInserted)[0],
  "K",
);

const deleted = SHEET_HEADERS.filter((h) => h !== "Notes");
check("a deleted column is caught", cols(deleted)[0], "F");

const swapped = [...SHEET_HEADERS];
[swapped[8], swapped[9]] = [swapped[9], swapped[8]];
check("two dates swapped are both caught", cols(swapped), ["I", "J"]);

const renamedAppColumn = [...SHEET_HEADERS];
renamedAppColumn[12] = "ID";
check("the app's own columns must match exactly", cols(renamedAppColumn), ["M"]);

check(
  "the problem names what was found and what belongs there",
  checkHeaders(inserted)[0],
  { col: "F", found: "Status", expected: "Notes" },
);

// --- Formula text. USER_ENTERED runs anything starting with "=".
const formula = (f: Parameters<typeof formulaProblem>[0], when: "create" | "update" = "create") =>
  formulaProblem(f, when);

check("a normal title is fine", formula({ title: "Fix login" }), null);
check(
  "a title starting with = is refused",
  formula({ title: '=IMPORTXML("http://x", "//a")' })?.message,
  "A task cannot be added with an = sign at the start.",
);
check("leading spaces do not get round it", formula({ title: "   =1+1" })?.field, "title");
check("= later in the text is fine", formula({ title: "Make a = b work" }), null);
check("description is checked", formula({ description: "=HYPERLINK(1)" })?.field, "description");
check("notes are checked", formula({ notes: "=A1" })?.message, "Notes cannot start with an = sign.");
check(
  "renaming says rename, not add",
  formula({ title: "=x" }, "update")?.message,
  "A task name cannot start with an = sign.",
);
check("a patch without text fields is fine", formula({}, "update"), null);

const w = (
  f: Parameters<typeof workItemFieldProblem>[0],
  when: "create" | "update" = "create",
) => workItemFieldProblem(f, when);

check("word count", wordCount("one two three"), 3);
const validPeople = {
  assigneeId: "vismay",
  secondaryAssigneeId: "tushar",
  type: "Kaagaz" as const,
} as const;

check(
  "create needs end date",
  w({
    title: "Ship it",
    description: "Details",
    plannedDate: null,
    ...validPeople,
  })?.field,
  "plannedDate",
);
check(
  "create needs description",
  w({
    title: "Ship it",
    description: "  ",
    plannedDate: "2026-01-01",
    ...validPeople,
  })?.field,
  "description",
);
check(
  "create needs primary person",
  w({
    title: "Ship it",
    description: "Details",
    plannedDate: "2026-01-01",
    assigneeId: null,
    secondaryAssigneeId: "tushar",
  })?.field,
  "assigneeId",
);
check(
  "create needs assigned by",
  w({
    title: "Ship it",
    description: "Details",
    plannedDate: "2026-01-01",
    assigneeId: "vismay",
    secondaryAssigneeId: null,
    type: "Kaagaz",
  })?.field,
  "secondaryAssigneeId",
);
check(
  "create needs product",
  w({
    title: "Ship it",
    description: "Details",
    plannedDate: "2026-01-01",
    ...validPeople,
    type: null,
  })?.field,
  "type",
);
check(
  "a date change ignores a blank assigned by",
  problemForPatch({ plannedDate: "2026-11-20" }),
  null,
);
check(
  "setting assigned by does not require the other fields",
  problemForPatch({ secondaryAssigneeId: "krishna" }),
  null,
);
check(
  "clearing assigned by is still refused",
  problemForPatch({ secondaryAssigneeId: null })?.field,
  "secondaryAssigneeId",
);
check(
  "clearing the end date is still refused",
  problemForPatch({ plannedDate: null })?.field,
  "plannedDate",
);
check(
  "title word limit",
  w({
    title: Array(MAX_TITLE_WORDS + 1).fill("word").join(" "),
    description: "ok",
    plannedDate: "2026-01-01",
    ...validPeople,
  })?.field,
  "title",
);

const oldDone: WorkItem = {
  id: "MON-1",
  ref: 1,
  title: "Old",
  description: "x",
  assigneeId: "vismay",
  secondaryAssigneeId: "tushar",
  status: "Completed",
  notes: "",
  createdDate: "2026-01-01",
  startedDate: null,
  plannedDate: null,
  actualDate: "2026-01-01",
  priority: "Medium",
  type: "Kaagaz",
  storyPoints: null,
  order: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
check(
  `completed after ${COMPLETED_ARCHIVE_AFTER_DAYS} days is archived`,
  isArchivedCompleted(oldDone, "2026-01-16"),
  true,
);
check(
  `completed within ${COMPLETED_ARCHIVE_AFTER_DAYS} days stays visible`,
  isArchivedCompleted(oldDone, "2026-01-14"),
  false,
);

check(
  "column sort uses end date",
  boardSortDay({ ...oldDone, plannedDate: "2026-02-01" }, "in-progress"),
  "2026-02-01",
);
check(
  "completed column prefers actual date",
  boardSortDay(oldDone, "completed"),
  "2026-01-01",
);
const handedOff: WorkItem = {
  ...oldDone,
  id: "MON-9",
  status: "Yet to Start",
  assigneeId: "vismay",
  secondaryAssigneeId: "tushar",
  actualDate: null,
};
check(
  "filtering by the primary person keeps the task",
  applyFilters([handedOff], { ...EMPTY_FILTERS, assigneeIds: ["vismay"] }).map(
    (i) => i.id,
  ),
  ["MON-9"],
);
check(
  "filtering by assigned by keeps the task",
  applyFilters([handedOff], { ...EMPTY_FILTERS, assigneeIds: ["tushar"] }).map(
    (i) => i.id,
  ),
  ["MON-9"],
);
check(
  "filtering by someone else drops the task",
  applyFilters([handedOff], { ...EMPTY_FILTERS, assigneeIds: ["krishna"] }).map(
    (i) => i.id,
  ),
  [],
);
const a = { ...oldDone, id: "a", plannedDate: "2026-01-05", order: 1 };
const b = { ...oldDone, id: "b", plannedDate: "2026-01-02", order: 2 };
check(
  "ascending date sort",
  sortColumnByDate([a, b], "yet-to-start", "asc").map((i) => i.id),
  ["b", "a"],
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
