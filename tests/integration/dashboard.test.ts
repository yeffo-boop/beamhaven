import { beforeEach, describe, expect, it } from "vitest";

import { addDays, dayKey } from "@/lib/calendar";
import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { activityHref, getHouseholdActivity } from "@/server/services/activity";
import { createQuote, rejectQuote } from "@/server/services/agreements";
import { createAppointment, deleteAppointment } from "@/server/services/appointments";
import { createLine, getCategories } from "@/server/services/budget";
import { createContractor } from "@/server/services/contractors";
import { getDashboard } from "@/server/services/dashboard";
import { addPayment, createExpense } from "@/server/services/expenses";
import { createMilestone } from "@/server/services/milestones";
import { createOrder } from "@/server/services/orders";
import { getHouseholdToday } from "@/server/services/preferences";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { changeTaskStatus, createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

/** A household with an active kitchen project (with a Materials line) and a finished one. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  const finished = (
    await createProject(ctx, { propertyId: property, name: "Porch", status: "completed" })
  ).id;
  const categories = await getCategories(ctx);
  const materials = (
    await createLine(ctx, {
      projectId: project,
      categoryId: categories.find((c) => c.name === "Materials")?.id ?? "",
      planned: "2000",
    })
  ).id;
  const contractor = (await createContractor(ctx, { name: `${name} Electric`, status: "active" }))
    .id;
  const today = await getHouseholdToday(ctx);
  /** A day counted from today, as a form would send it. */
  const on = (days: number) => dayKey(addDays(today, days));
  return { user, workspaceId, ctx, property, project, finished, materials, contractor, today, on };
}

describe("home dashboard", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("starts empty for a new household", async () => {
    const user = await createUser("Nia");
    const workspaceId = await createHousehold("Nia's household", user.id);
    const ctx = await contextFor(user.id, workspaceId);
    const home = await getDashboard(ctx);
    expect(home).toMatchObject({ budget: null, projects: [], attention: [], week: [] });
  });

  it("lists what needs attention, what's on this week, and active projects", async () => {
    const a = await household("Ana");

    // Tasks: one overdue, one due today, one done (left out), one next week (not yet).
    await createTask(a.ctx, { title: "Seal grout", projectId: a.project, dueDate: a.on(-3) });
    await createTask(a.ctx, { title: "Pick knobs", projectId: a.project, dueDate: a.on(0) });
    const done = (
      await createTask(a.ctx, { title: "Measure", projectId: a.project, dueDate: a.on(-1) })
    ).id;
    await changeTaskStatus(a.ctx, done, "done");
    await createTask(a.ctx, { title: "Later", projectId: a.project, dueDate: a.on(5) });

    // A bill due in two days, partly paid; a paid one is left out.
    const bill = (
      await createExpense(a.ctx, {
        description: "Cabinet balance",
        total: "3000",
        expenseDate: a.on(-10),
        dueDate: a.on(2),
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      })
    ).id;
    await addPayment(a.ctx, bill, { amount: "1000", paidOn: a.on(-10), method: "check" });
    const paid = (
      await createExpense(a.ctx, {
        description: "Sink",
        total: "400",
        expenseDate: a.on(-10),
        dueDate: a.on(1),
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      })
    ).id;
    await addPayment(a.ctx, paid, { amount: "400", paidOn: a.on(-10), method: "card" });

    // A delivery expected tomorrow.
    await createOrder(a.ctx, a.project, {
      supplier: "Tile Shop",
      orderNumber: "A1",
      orderedOn: a.on(-5),
      expectedOn: a.on(1),
      items: [{ description: "Tile", quantity: "10", unitPrice: "50", lineId: a.materials }],
    });

    // A quote waiting for a decision, and one already turned down (left out).
    await createQuote(a.ctx, {
      contractorId: a.contractor,
      projectId: a.project,
      title: "Rewire kitchen",
      amount: "4200",
      receivedOn: a.on(-2),
    });
    const turnedDown = (
      await createQuote(a.ctx, {
        contractorId: a.contractor,
        projectId: a.project,
        title: "Gold fixtures",
        amount: "9000",
        receivedOn: a.on(-2),
      })
    ).id;
    await rejectQuote(a.ctx, turnedDown, { note: "" });

    // Milestones: a past one is skipped; the next upcoming one is shown.
    await createMilestone(a.ctx, a.project, { name: "Demo done", targetDate: a.on(-20) });
    await createMilestone(a.ctx, a.project, { name: "Counters in", targetDate: a.on(30) });
    await createMilestone(a.ctx, a.project, { name: "Cabinets in", targetDate: a.on(10) });

    await createAppointment(a.ctx, { title: "Inspection", day: a.on(3) });
    await createAppointment(a.ctx, { title: "Next month", day: a.on(40) });

    const home = await getDashboard(a.ctx);

    expect(home.attention.map((i) => [i.kind, i.title, i.overdue])).toEqual([
      ["task", "Seal grout", true],
      ["task", "Pick knobs", false],
      ["delivery", expect.stringContaining("Tile Shop"), false],
      ["bill", "Cabinet balance", false],
      ["quote", "Rewire kitchen", false],
    ]);
    expect(home.attention[0]?.reason).toBe("3 days overdue");
    expect(home.attention[1]?.reason).toBe("Due today");
    expect(home.attention.every((i) => i.href.startsWith("/"))).toBe(true);

    // This week: today through six days on, so the inspection is in and next month is not.
    const titles = home.week.map((e) => e.title);
    expect(titles).toContain("Inspection");
    expect(titles).toContain("Later");
    expect(titles).not.toContain("Next month");
    expect(titles).not.toContain("Seal grout");
    expect(home.week.every((e) => e.day >= a.today)).toBe(true);

    // Only the active project, with its budget and next milestone.
    expect(home.projects).toHaveLength(1);
    expect(home.projects[0]).toMatchObject({
      id: a.project,
      name: "Kitchen",
      status: "in_progress",
      nextMilestone: { name: "Cabinets in" },
    });
    expect(home.projects[0]?.budget?.current).toBe(200000n);
    expect(home.budget?.current).toBe(200000n);

    // The latest history, newest first.
    expect(home.activity.length).toBeGreaterThan(0);
    expect(home.activity.length).toBeLessThanOrEqual(10);
  });

  it("is open to viewers and shows nothing from another household", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    await createTask(b.ctx, { title: "Ben's task", projectId: b.project, dueDate: b.on(-1) });
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);

    const home = await getDashboard(viewer);
    expect(home.attention).toEqual([]);
    expect(home.projects.map((p) => p.id)).toEqual([a.project]);
    expect(home.activity.every((e) => e.entityId !== b.project)).toBe(true);
  });
});

describe("household activity feed", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("links each event to its record, except deleted ones", () => {
    expect(activityHref({ action: "project.updated", entityType: "project", entityId: "p1" })).toBe(
      "/projects/p1",
    );
    expect(activityHref({ action: "expense.paid", entityType: "expense", entityId: "e1" })).toBe(
      "/budget/expenses/e1",
    );
    expect(
      activityHref({ action: "document.created", entityType: "document", entityId: "d1" }),
    ).toBe("/files/d1");
    expect(
      activityHref({ action: "project.deleted", entityType: "project", entityId: "p1" }),
    ).toBeNull();
    expect(activityHref({ action: "x.made", entityType: "unknown", entityId: "u1" })).toBeNull();
  });

  it("lists newest first, filters by kind, and pages back", async () => {
    const a = await household("Ana");
    await createQuote(a.ctx, {
      contractorId: a.contractor,
      projectId: a.project,
      title: "Rewire kitchen",
      amount: "4200",
      receivedOn: a.on(-2),
    });

    const all = await getHouseholdActivity(a.ctx);
    const times = all.map((e) => e.createdAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    // A quote is logged on its project and its contractor.
    expect(
      all
        .slice(0, 2)
        .map((e) => e.entityType)
        .sort(),
    ).toEqual(["contractor", "project"]);
    expect(all[0]).toMatchObject({ actorName: "Ana" });
    expect(all[0]?.summary).toContain("Rewire kitchen");
    expect(all.find((e) => e.entityType === "contractor")?.href).toBe(
      `/contractors/${a.contractor}`,
    );

    const projects = await getHouseholdActivity(a.ctx, { entityType: "project" });
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((e) => e.entityType === "project")).toBe(true);

    const first = await getHouseholdActivity(a.ctx, { limit: 1 });
    expect(first).toHaveLength(1);
    const older = await getHouseholdActivity(a.ctx, { before: first[0]?.createdAt });
    expect(older.every((e) => e.createdAt < (first[0]?.createdAt ?? new Date()))).toBe(true);
  });

  it("drops the link once a record is deleted, and never shows another household's", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const { id } = await createAppointment(a.ctx, { title: "Plumber", day: a.on(2) });
    await deleteAppointment(a.ctx, id);
    const feed = await getHouseholdActivity(a.ctx);
    // Every event about the deleted appointment loses its link, not only the last one.
    expect(feed.find((e) => e.action === "appointment.created")?.href).toBeNull();
    const deleted = feed.find((e) => e.action === "appointment.deleted");
    expect(deleted).toBeDefined();
    expect(deleted?.href).toBeNull();

    const ids = new Set([b.project, b.finished, b.property, b.contractor]);
    expect(feed.some((e) => ids.has(e.entityId))).toBe(false);
  });

  it("is readable by viewers but needs a membership", async () => {
    const a = await household("Ana");
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await getHouseholdActivity(viewer)).length).toBeGreaterThan(0);
    expect(await resolveWorkspaceContext(vera.id, (await household("Ben")).workspaceId)).toBeNull();
    // Roles are checked by can(): a context without the view permission is refused.
    await expect(
      getHouseholdActivity({ ...viewer, role: "nobody" as WorkspaceContext["role"] }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
