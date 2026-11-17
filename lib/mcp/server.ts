import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STARTED_STAGES } from "@/lib/constants";
import { todayIso } from "@/lib/dates";
import {
  createItem,
  getItem,
  loadItems,
  updateItem,
} from "@/lib/server/sheet-store";
import { SheetError } from "@/lib/server/sheets";
import { applyFilters } from "@/lib/store";
import {
  PRIORITIES,
  PRODUCTS,
  STATUSES,
  type Member,
  type Priority,
  type Product,
  type Status,
  type WorkItem,
} from "@/lib/types";

function fail(error: unknown) {
  const message =
    error instanceof SheetError
      ? [error.message, error.hint].filter(Boolean).join(" — ")
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function ok(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function normaliseId(id: string): string {
  const trimmed = id.trim();
  if (/^MON-\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+$/.test(trimmed)) return `MON-${trimmed}`;
  throw new SheetError(
    `Work item id "${id}" is not a MON number.`,
    400,
    "Use MON-12 or 12.",
  );
}

function resolvePerson(team: Member[], who: string, label: string): string {
  const key = who.trim().toLowerCase();
  if (!key) {
    throw new SheetError(
      `${label} is required.`,
      400,
      "Pass a name or member id from the Team tab.",
    );
  }
  const hits = team.filter((member) => {
    return (
      member.id.toLowerCase() === key ||
      member.name.toLowerCase() === key ||
      member.name.toLowerCase().split(" ")[0] === key ||
      (member.email ?? "").toLowerCase() === key
    );
  });
  const unique = new Map(hits.map((member) => [member.id, member]));
  if (unique.size === 1) return [...unique.values()][0].id;
  const names = team.map((member) => member.name).join(", ");
  if (unique.size === 0) {
    throw new SheetError(
      `${label} "${who}" is not on the team.`,
      400,
      names ? `Choose one of: ${names}.` : "The Team tab has no people yet.",
    );
  }
  throw new SheetError(
    `${label} "${who}" matches more than one person.`,
    400,
    `Use a full name or id. People: ${names}.`,
  );
}

function nameOf(team: Member[], id: string | null): string | null {
  if (!id) return null;
  return team.find((member) => member.id === id)?.name ?? id;
}

function summarise(item: WorkItem, team: Member[]) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    product: item.type,
    priority: item.priority,
    primaryPerson: nameOf(team, item.assigneeId),
    assignedBy: nameOf(team, item.secondaryAssigneeId),
    endDate: item.plannedDate,
    description: item.description,
    notes: item.notes,
    storyPoints: item.storyPoints,
    startedDate: item.startedDate,
    actualDate: item.actualDate,
    updatedAt: item.updatedAt,
  };
}

/** A fresh server per request. The sheet calls are stateless. */
export function createTrackerMcp() {
  const server = new McpServer({
    name: "monoedge-tracker",
    version: "0.1.0",
  });

  server.registerTool(
    "list_work_items",
    {
      title: "List work items",
      description:
        "List tracker tasks from the shared Google Sheet. Optional filters match the board: text search, status, product, person, and whether to include completed work older than 14 days.",
      inputSchema: {
        query: z.string().optional().describe("Search title, description, and id"),
        status: z.enum(STATUSES).optional(),
        product: z.enum(PRODUCTS).optional(),
        person: z
          .string()
          .optional()
          .describe("Name or member id of the primary person or the person who assigned it"),
        includeArchived: z
          .boolean()
          .optional()
          .describe("Include completed tasks older than 14 days. Default false."),
      },
    },
    async ({ query, status, product, person, includeArchived }) => {
      try {
        const { items, members, warnings } = await loadItems();
        const assigneeId = person
          ? resolvePerson(members, person, "Person")
          : undefined;
        const visible = applyFilters(items, {
          query: query ?? "",
          assigneeIds: assigneeId ? [assigneeId] : [],
          priorities: [],
          types: product ? [product] : [],
          hideCompleted: false,
          hiddenColumns: [],
          showArchived: includeArchived ?? Boolean(query?.trim()),
        }).filter((item) => (status ? item.status === status : true));
        return ok({
          count: visible.length,
          warnings,
          items: visible.map((item) => summarise(item, members)),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_work_item",
    {
      title: "Get work item",
      description: "Read one task by MON id (MON-12 or 12).",
      inputSchema: {
        id: z.string().describe("MON-12 or 12"),
      },
    },
    async ({ id }) => {
      try {
        const { members } = await loadItems();
        const item = await getItem(normaliseId(id));
        return ok(summarise(item, members));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "create_work_item",
    {
      title: "Create work item",
      description:
        "Add a task to the tracking sheet. Title, description, product, primary person, assigned by, and end date are required. Title must be 20 words or fewer.",
      inputSchema: {
        title: z.string(),
        description: z.string(),
        product: z.enum(PRODUCTS),
        primaryPerson: z.string().describe("Name or member id of the owner"),
        assignedBy: z.string().describe("Name or member id of who assigned it"),
        endDate: z.string().describe("yyyy-mm-dd"),
        status: z.enum(STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        notes: z.string().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
      },
    },
    async (input) => {
      try {
        const { members } = await loadItems();
        const status: Status = input.status ?? "Yet to Start";
        const priority: Priority = input.priority ?? "Medium";
        const today = todayIso();
        const item: WorkItem = {
          id: "pending",
          ref: 0,
          title: input.title,
          description: input.description,
          assigneeId: resolvePerson(members, input.primaryPerson, "Primary person"),
          secondaryAssigneeId: resolvePerson(members, input.assignedBy, "Assigned by"),
          status,
          notes: input.notes?.trim() ?? "",
          createdDate: today,
          startedDate: STARTED_STAGES.includes(status) ? today : null,
          plannedDate: input.endDate,
          actualDate: status === "Completed" ? today : null,
          priority,
          type: input.product,
          storyPoints: input.storyPoints ?? null,
          order: 0,
          updatedAt: new Date().toISOString(),
        };
        const saved = await createItem(item);
        return ok(summarise(saved, members));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update work item",
      description:
        "Change fields on an existing task. Only the fields you pass are written. Clearing required fields is refused.",
      inputSchema: {
        id: z.string().describe("MON-12 or 12"),
        title: z.string().optional(),
        description: z.string().optional(),
        product: z.enum(PRODUCTS).optional(),
        primaryPerson: z.string().optional(),
        assignedBy: z.string().optional(),
        endDate: z.string().optional().describe("yyyy-mm-dd"),
        status: z.enum(STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        notes: z.string().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
      },
    },
    async (input) => {
      try {
        const { members } = await loadItems();
        const id = normaliseId(input.id);
        const current = await getItem(id);
        const status = input.status ?? current.status;
        const patch: Partial<WorkItem> = {};
        if (input.title !== undefined) patch.title = input.title;
        if (input.description !== undefined) patch.description = input.description;
        if (input.product !== undefined) patch.type = input.product;
        if (input.primaryPerson !== undefined) {
          patch.assigneeId = resolvePerson(members, input.primaryPerson, "Primary person");
        }
        if (input.assignedBy !== undefined) {
          patch.secondaryAssigneeId = resolvePerson(members, input.assignedBy, "Assigned by");
        }
        if (input.endDate !== undefined) patch.plannedDate = input.endDate;
        if (input.status !== undefined) {
          patch.status = input.status;
          if (STARTED_STAGES.includes(status) && !current.startedDate) {
            patch.startedDate = todayIso();
          }
          if (status === "Completed" && !current.actualDate) patch.actualDate = todayIso();
          if (status !== "Completed" && current.actualDate) patch.actualDate = null;
        }
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.storyPoints !== undefined) patch.storyPoints = input.storyPoints;
        if (Object.keys(patch).length === 0) {
          throw new SheetError(
            "Nothing to update.",
            400,
            "Pass at least one field besides id.",
          );
        }
        const saved = await updateItem(id, patch, current.updatedAt);
        return ok(summarise(saved, members));
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
