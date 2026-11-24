import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { toCsv } from "@/lib/csv";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { createLine, getCategories } from "@/server/services/budget";
import { NotFoundError } from "@/server/services/errors";
import { addPayment, createExpense } from "@/server/services/expenses";
import { createMilestone } from "@/server/services/milestones";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { buildCsvReport, getProjectReport } from "@/server/services/reports";
import { changeTaskStatus, createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

/** Two projects, each with a Materials line; the kitchen has a split bill and two tasks. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const kitchen = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  const bath = (
    await createProject(ctx, { propertyId: property, name: "Bath", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const materials = categories.find((c) => c.name === "Materials")?.id ?? "";
  const kitchenLine = (
    await createLine(ctx, { projectId: kitchen, categoryId: materials, planned: "2000" })
  ).id;
  const bathLine = (
    await createLine(ctx, { projectId: bath, categoryId: materials, planned: "500" })
  ).id;
  // $300 split $200 kitchen and $100 bath, with $50 paid.
  const bill = (
    await createExpense(ctx, {
      description: "=cmd|' /C calc'!A0",
      total: "300",
      expenseDate: "2026-11-02",
      allocations: [
        { lineId: kitchenLine, amount: "200", kind: "item" },
        { lineId: bathLine, amount: "100", kind: "item" },
      ],
    })
  ).id;
  await addPayment(ctx, bill, { amount: "50", paidOn: "2026-11-03", method: "card" });
  const cabinets = (await createMilestone(ctx, kitchen, { name: "Cabinets in" })).id;
  await createTask(ctx, {
    title: "Hang cabinets",
    projectId: kitchen,
    milestoneId: cabinets,
    dueDate: "2026-12-01",
  });
  const done = (await createTask(ctx, { title: "Demo", projectId: kitchen })).id;
  await changeTaskStatus(ctx, done, "done");
  return { user, workspaceId, ctx, kitchen, bath };
}

describe("reports", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("exports budget lines for the household or one project", async () => {
    const a = await household("Ana");
    const all = await buildCsvReport(a.ctx, "budget", null);
    expect(all.fileName).toBe("budget-lines-all-projects.csv");
    expect(all.header.slice(0, 6)).toEqual([
      "Project",
      "Category",
      "Room",
      "Line",
      "Original",
      "Current",
    ]);
    expect(all.rows).toHaveLength(2);

    const kitchen = await buildCsvReport(a.ctx, "budget", a.kitchen);
    expect(kitchen.fileName).toBe("budget-lines-kitchen.csv");
    expect(kitchen.rows).toHaveLength(1);
    const csv = toCsv(kitchen.header, kitchen.rows);
    // Not locked, so no original or variance; the $200 share counts as committed and spent.
    expect(csv.split("\r\n")[1]).toBe(
      // Its share of the $50 paid is a third: $33.33.
      "Kitchen,Materials,Whole project,,,2000.00,200.00,200.00,33.33,166.67,200.00,1800.00,",
    );
  });

  it("exports expenses with what's owed, and the share on one project", async () => {
    const a = await household("Ana");
    const all = await buildCsvReport(a.ctx, "expenses", "");
    expect(all.header).not.toContain("Share on Kitchen");
    const bath = await buildCsvReport(a.ctx, "expenses", a.bath);
    expect(bath.header.at(-1)).toBe("Share on Bath");
    const line = toCsv(bath.header, bath.rows).split("\r\n")[1];
    // The description would be a formula in a spreadsheet, so it's made plain text.
    expect(line).toBe(`2026-11-02,'=cmd|' /C calc'!A0,,,300.00,50.00,250.00,Partly paid,No,100.00`);
  });

  it("exports tasks with their milestone and status", async () => {
    const a = await household("Ana");
    const tasks = await buildCsvReport(a.ctx, "tasks", a.kitchen);
    const rows = toCsv(tasks.header, tasks.rows).split("\r\n");
    expect(rows).toContain("Kitchen,Cabinets in,Hang cabinets,To do,Normal,2026-12-01,,,");
    expect(rows.some((r) => r.startsWith("Kitchen,,Demo,Done,"))).toBe(true);
    expect((await buildCsvReport(a.ctx, "tasks", a.bath)).rows).toEqual([]);
  });

  it("gathers the printable project report", async () => {
    const a = await household("Ana");
    const report = await getProjectReport(a.ctx, a.kitchen);
    expect(report.statusLabel).toBe("In progress");
    expect(report.budget.totals.current).toBe(200000n);
    expect(report.milestones.map((m) => m.name)).toEqual(["Cabinets in"]);
    expect(report.openTasks.map((t) => t.title)).toEqual(["Hang cabinets"]);
    expect(report.doneTaskCount).toBe(1);
    expect(report.budget.expenses[0]?.shareCents).toBe(20000n);
  });

  it("refuses unknown reports and other households' projects, and works for viewers", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    await expect(buildCsvReport(a.ctx, "passwords", null)).rejects.toBeInstanceOf(ZodError);
    await expect(buildCsvReport(a.ctx, "budget", b.kitchen)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getProjectReport(a.ctx, b.kitchen)).rejects.toBeInstanceOf(NotFoundError);

    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await buildCsvReport(viewer, "expenses", null)).rows).toHaveLength(1);
    // The household export never includes the other household's lines.
    expect((await buildCsvReport(a.ctx, "budget", null)).rows).toHaveLength(2);
  });
});
