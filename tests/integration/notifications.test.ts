import { beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/data/client";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { insertNotifications } from "@/server/data/notifications";
import { approveQuote, createQuote, rejectQuote } from "@/server/services/agreements";
import { addBoardItem, createBoard, markBoardItem } from "@/server/services/boards";
import { createLine, getCategories } from "@/server/services/budget";
import { createContractor } from "@/server/services/contractors";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
} from "@/server/services/notifications";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { changeTaskStatus, createTask, getTask, updateTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

/** Ana owns the household; Max is a member; Vera is a viewer. */
async function household() {
  const ana = await createUser("Ana");
  const workspaceId = await createHousehold("Ana's household", ana.id);
  const max = await createUser("Max");
  const vera = await createUser("Vera");
  await addMember(workspaceId, max.id, "member");
  await addMember(workspaceId, vera.id, "viewer");
  const a = await contextFor(ana.id, workspaceId);
  const m = await contextFor(max.id, workspaceId);
  const v = await contextFor(vera.id, workspaceId);
  const property = (await createProperty(a, { name: "House" })).id;
  const project = (
    await createProject(a, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  return { ana, max, vera, workspaceId, a, m, v, project };
}

const texts = async (ctx: WorkspaceContext) =>
  (await getNotifications(ctx)).map((n) => `${n.actorName} ${n.summary}`);

describe("notifications", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("tells someone when another person gives them a task, but not when they take it themselves", async () => {
    const h = await household();
    const paint = (
      await createTask(h.a, {
        title: "Paint",
        projectId: h.project,
        assignee: `user:${h.max.id}`,
      })
    ).id;
    expect(await texts(h.m)).toEqual(["Ana gave you the task “Paint”"]);
    expect((await getNotifications(h.m))[0]?.href).toBe(`/tasks/${paint}`);

    // Max gives himself a task: nothing.
    await createTask(h.m, { title: "Sand", projectId: h.project, assignee: `user:${h.max.id}` });
    expect(await getUnreadNotificationCount(h.m)).toBe(1);

    // Reassigning to Vera tells Vera; saving again without a change tells no one.
    const task = await getTask(h.a, paint);
    const input = { title: "Paint", projectId: h.project, status: task.status };
    await updateTask(h.a, paint, { ...input, assignee: `user:${h.vera.id}` });
    await updateTask(h.a, paint, { ...input, assignee: `user:${h.vera.id}` });
    expect(await texts(h.v)).toEqual(["Ana gave you the task “Paint”"]);
  });

  it("tells the creator and the assignee when someone else finishes a task", async () => {
    const h = await household();
    const id = (
      await createTask(h.a, { title: "Tile", projectId: h.project, assignee: `user:${h.vera.id}` })
    ).id;
    await changeTaskStatus(h.m, id, "done");
    expect(await texts(h.a)).toEqual(["Max finished the task “Tile”"]);
    expect(await texts(h.v)).toEqual([
      "Max finished the task “Tile”",
      "Ana gave you the task “Tile”",
    ]);
    expect(await getNotifications(h.m)).toEqual([]);
    // Marking it done again doesn't repeat it.
    await changeTaskStatus(h.m, id, "done");
    expect(await getUnreadNotificationCount(h.a)).toBe(1);
  });

  it("tells whoever entered a quote when someone else decides on it", async () => {
    const h = await household();
    const contractor = (await createContractor(h.m, { name: "Spark Electric", status: "active" }))
      .id;
    const categories = await getCategories(h.a);
    const line = (
      await createLine(h.a, {
        projectId: h.project,
        categoryId: categories.find((c) => c.name === "Labor")?.id ?? categories[0]?.id ?? "",
        planned: "5000",
      })
    ).id;
    const quote = (
      await createQuote(h.m, {
        contractorId: contractor,
        projectId: h.project,
        title: "Rewire",
        amount: "4000",
        receivedOn: "2026-11-01",
      })
    ).id;
    const other = (
      await createQuote(h.m, {
        contractorId: contractor,
        projectId: h.project,
        title: "Gold switches",
        amount: "900",
        receivedOn: "2026-11-01",
      })
    ).id;
    await approveQuote(h.a, quote, { lineId: line, committedOn: "2026-11-02", note: "" });
    await rejectQuote(h.a, other, { note: "" });
    expect(await texts(h.m)).toEqual([
      "Ana turned down the quote “Gold switches”",
      "Ana approved the quote “Rewire”",
    ]);
  });

  it("tells whoever started a board when someone else approves something on it", async () => {
    const h = await household();
    const board = (await createBoard(h.a, { name: "Finishes", roomId: "", projectId: "" })).id;
    const item = {
      kind: "color",
      title: "Sage",
      notes: "",
      colorHex: "#9caf88",
      brand: "",
      code: "",
      productUrl: "",
      materialId: "",
    };
    const sage = (await addBoardItem(h.a, board, item, null)).id;
    await markBoardItem(h.m, board, sage, "approved", true);
    await markBoardItem(h.m, board, sage, "approved", false);
    await markBoardItem(h.m, board, sage, "preferred", true);
    expect(await texts(h.a)).toEqual(["Max approved “Sage” on a design board"]);
    // Approving your own board's item tells no one.
    await markBoardItem(h.a, board, sage, "approved", true);
    expect(await getUnreadNotificationCount(h.a)).toBe(1);
  });

  it("is private to each person and household, and marks read only your own", async () => {
    const h = await household();
    const ben = await createUser("Ben");
    const benHousehold = await createHousehold("Ben's household", ben.id);
    const b = await contextFor(ben.id, benHousehold);

    await createTask(h.a, { title: "Paint", projectId: h.project, assignee: `user:${h.max.id}` });
    await createTask(h.a, { title: "Trim", projectId: h.project, assignee: `user:${h.vera.id}` });
    expect(await getUnreadNotificationCount(h.a)).toBe(0);
    expect(await getNotifications(b)).toEqual([]);

    // Someone outside the household never gets one, even if code tried.
    expect(
      await insertNotifications(h.a, [
        { userId: ben.id, kind: "task_assigned", summary: "x", href: "/tasks/x" },
      ]),
    ).toBe(0);

    const [maxNote] = await getNotifications(h.m);
    // Vera can't mark Max's read.
    await markNotificationRead(h.v, maxNote?.id);
    expect(await getUnreadNotificationCount(h.m)).toBe(1);
    await markNotificationRead(h.m, maxNote?.id);
    expect(await getUnreadNotificationCount(h.m)).toBe(0);
    // Viewers can mark their own read.
    await markNotificationRead(h.v);
    expect(await getUnreadNotificationCount(h.v)).toBe(0);

    // The database only takes the known kinds and links inside the app.
    await expect(
      getPrisma().notification.create({
        data: {
          id: "n1",
          workspaceId: h.workspaceId,
          userId: h.max.id,
          kind: "task_assigned",
          summary: "x",
          href: "https://evil.example",
        },
      }),
    ).rejects.toThrow();
  });
});
