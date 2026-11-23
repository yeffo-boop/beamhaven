import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseDay } from "@/lib/calendar";
import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { setTimeZone } from "@/server/data/workspaces";
import {
  createAppointment,
  deleteAppointment,
  getAppointment,
  getAppointments,
  getCalendar,
  updateAppointment,
} from "@/server/services/appointments";
import { createLine, getCategories } from "@/server/services/budget";
import { createContractor, deleteContractor } from "@/server/services/contractors";
import { NotFoundError } from "@/server/services/errors";
import { addPayment, createExpense } from "@/server/services/expenses";
import { createMilestone } from "@/server/services/milestones";
import { createOrder, getOrder, recordDelivery, updateOrder } from "@/server/services/orders";
import { getHouseholdToday, getTimeZonePreference } from "@/server/services/preferences";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom } from "@/server/services/rooms";
import { changeTaskStatus, createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);
const invalid = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ZodError);

const day = (value: string) => parseDay(value) ?? new Date(NaN);

/** A kitchen project (and a bathroom one), the kitchen, a Materials line and an electrician. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const room = (await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" }))
    .id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  const other = (
    await createProject(ctx, { propertyId: property, name: "Bathroom", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const materials = (
    await createLine(ctx, {
      projectId: project,
      categoryId: categories.find((c) => c.name === "Materials")?.id ?? "",
      planned: "2000",
    })
  ).id;
  const electrician = (await createContractor(ctx, { name: `${name} Electric`, status: "active" }))
    .id;
  return { user, workspaceId, ctx, property, room, project, other, materials, electrician };
}

describe("appointments", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("saves an inspection with its times, links and result", async () => {
    const a = await household("Ana");
    const { id } = await createAppointment(a.ctx, {
      title: "Electrical rough-in",
      kind: "inspection",
      day: "2026-12-02",
      startTime: "9:30",
      endTime: "11:00",
      location: "Basement",
      projectId: a.project,
      roomId: a.room,
      contractorId: a.electrician,
      outcome: "",
    });
    expect(await getAppointment(a.ctx, id)).toMatchObject({
      title: "Electrical rough-in",
      kind: "inspection",
      day: day("2026-12-02"),
      startTime: "09:30",
      endTime: "11:00",
      projectName: "Kitchen",
      roomName: "Kitchen",
      contractorName: "Ana Electric",
      outcome: null,
    });

    await updateAppointment(a.ctx, id, {
      title: "Electrical rough-in",
      kind: "inspection",
      day: "2026-12-02",
      startTime: "09:30",
      projectId: a.project,
      outcome: "failed",
    });
    expect(await getAppointment(a.ctx, id)).toMatchObject({ outcome: "failed", endTime: null });

    // Only an inspection passes or fails: anything else drops the result.
    await updateAppointment(a.ctx, id, {
      title: "Walkthrough",
      kind: "appointment",
      day: "2026-12-02",
      outcome: "passed",
    });
    expect(await getAppointment(a.ctx, id)).toMatchObject({ kind: "appointment", outcome: null });

    expect(await getAppointments(a.ctx, { projectId: a.project })).toHaveLength(0);
    await deleteAppointment(a.ctx, id);
    await notFound(getAppointment(a.ctx, id));
  });

  it("checks the times", async () => {
    const a = await household("Ana");
    const base = { title: "Delivery window", kind: "delivery", day: "2026-12-02" };
    await invalid(createAppointment(a.ctx, { ...base, endTime: "10:00" }));
    await invalid(createAppointment(a.ctx, { ...base, startTime: "10:00", endTime: "09:00" }));
    await invalid(createAppointment(a.ctx, { ...base, startTime: "25:00" }));
    await invalid(createAppointment(a.ctx, { ...base, day: "2026-02-30" }));
    const { id } = await createAppointment(a.ctx, base);
    expect(await getAppointment(a.ctx, id)).toMatchObject({ startTime: null, endTime: null });
  });

  it("keeps the appointment when its contractor or project goes", async () => {
    const a = await household("Ana");
    const { id } = await createAppointment(a.ctx, {
      title: "Panel upgrade",
      day: "2026-12-03",
      projectId: a.other,
      contractorId: a.electrician,
    });
    await deleteContractor(a.ctx, a.electrician);
    await deleteProject(a.ctx, a.other);
    expect(await getAppointment(a.ctx, id)).toMatchObject({ contractorId: null, projectId: null });
  });

  it("keeps each household's appointments to itself", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const { id } = await createAppointment(a.ctx, { title: "Plumber", day: "2026-12-04" });
    await notFound(getAppointment(b.ctx, id));
    await notFound(updateAppointment(b.ctx, id, { title: "Mine now", day: "2026-12-04" }));
    await notFound(deleteAppointment(b.ctx, id));
    expect(await getAppointments(b.ctx)).toHaveLength(0);
    // Nor can one point at another household's project, room or contractor.
    await notFound(
      createAppointment(b.ctx, { title: "X", day: "2026-12-04", projectId: a.project }),
    );
    await notFound(createAppointment(b.ctx, { title: "X", day: "2026-12-04", roomId: a.room }));
    await notFound(
      createAppointment(b.ctx, { title: "X", day: "2026-12-04", contractorId: a.electrician }),
    );
    await notFound(
      updateAppointment(a.ctx, id, { title: "X", day: "2026-12-04", projectId: b.project }),
    );
    expect(await getAppointment(a.ctx, id)).toMatchObject({ title: "Plumber" });
  });

  it("lets a viewer look but not change anything", async () => {
    const a = await household("Ana");
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    const { id } = await createAppointment(a.ctx, { title: "Plumber", day: "2026-12-04" });
    expect(await getAppointment(viewer, id)).toMatchObject({ title: "Plumber" });
    expect(
      await getCalendar(viewer, { from: day("2026-12-01"), to: day("2026-12-31") }),
    ).toHaveLength(1);
    await forbidden(createAppointment(viewer, { title: "X", day: "2026-12-04" }));
    await forbidden(updateAppointment(viewer, id, { title: "X", day: "2026-12-04" }));
    await forbidden(deleteAppointment(viewer, id));
  });
});

describe("the calendar", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("brings together everything with a date, by day and time", async () => {
    const a = await household("Ana");
    await createAppointment(a.ctx, {
      title: "Final inspection",
      kind: "inspection",
      day: "2026-12-10",
      startTime: "14:00",
      projectId: a.project,
      outcome: "passed",
    });
    await createAppointment(a.ctx, {
      title: "Counter template",
      day: "2026-12-10",
      startTime: "08:00",
      projectId: a.project,
    });
    const paint = (
      await createTask(a.ctx, { title: "Paint", projectId: a.project, dueDate: "2026-12-08" })
    ).id;
    await changeTaskStatus(a.ctx, paint, "done");
    await createTask(a.ctx, { title: "Order knobs", projectId: a.project, dueDate: "2026-12-09" });
    await createMilestone(a.ctx, a.project, { name: "Cabinets in", targetDate: "2026-12-12" });

    // Ten boxes expected on the 5th; six come on the 3rd, so the rest is still expected.
    const order = (
      await createOrder(a.ctx, a.project, {
        supplier: "Tile Shop",
        orderNumber: "A1",
        orderedOn: "2026-11-30",
        expectedOn: "2026-12-05",
        items: [{ description: "Tile", quantity: "10", unitPrice: "50", lineId: a.materials }],
      })
    ).id;
    const item = (await getOrder(a.ctx, order)).items[0]?.id ?? "";
    await recordDelivery(a.ctx, order, { deliveredOn: "2026-12-03" }, { [item]: "6" });

    // A bill due on the 15th, half paid; a paid one isn't on the calendar.
    const bill = (
      await createExpense(a.ctx, {
        description: "Cabinet balance",
        total: "3000",
        expenseDate: "2026-12-01",
        dueDate: "2026-12-15",
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      })
    ).id;
    await addPayment(a.ctx, bill, { amount: "1500", paidOn: "2026-12-01", method: "check" });
    const paid = (
      await createExpense(a.ctx, {
        description: "Sink",
        total: "400",
        expenseDate: "2026-12-01",
        dueDate: "2026-12-16",
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      })
    ).id;
    await addPayment(a.ctx, paid, { amount: "400", paidOn: "2026-12-01", method: "card" });

    // Outside the dates asked for.
    await createAppointment(a.ctx, { title: "January", day: "2027-01-02" });

    const december = { from: day("2026-12-01"), to: day("2026-12-31") };
    const entries = await getCalendar(a.ctx, december);
    expect(
      entries.map((e) => [e.day.toISOString().slice(0, 10), e.kind, e.title, e.note, e.done]),
    ).toEqual([
      ["2026-12-03", "delivered", "Order from Tile Shop (#A1)", "Delivered", true],
      ["2026-12-05", "expected", "Order from Tile Shop (#A1)", "Rest expected", false],
      ["2026-12-08", "task", "Paint", "Done", true],
      ["2026-12-09", "task", "Order knobs", "Due", false],
      ["2026-12-10", "appointment", "Counter template", null, false],
      ["2026-12-10", "inspection", "Final inspection", "Passed", true],
      ["2026-12-12", "milestone", "Cabinets in", "Target", false],
      ["2026-12-15", "payment", "Cabinet balance", "Payment due", false],
    ]);
    expect(entries.find((e) => e.kind === "payment")).toMatchObject({
      href: `/budget/expenses/${bill}`,
      projectName: "Kitchen",
    });

    // Once the rest arrives, only the deliveries are left.
    await recordDelivery(a.ctx, order, { deliveredOn: "2026-12-05" }, { [item]: "4" });
    const after = await getCalendar(a.ctx, december);
    expect(after.filter((e) => e.title.startsWith("Order from")).map((e) => e.kind)).toEqual([
      "delivered",
      "delivered",
    ]);

    // Another project's calendar has none of it; another household sees nothing.
    expect(await getCalendar(a.ctx, { ...december, projectId: a.other })).toEqual([]);
    expect(await getCalendar(a.ctx, { ...december, projectId: a.project })).toHaveLength(
      after.length,
    );
    const b = await household("Ben");
    expect(await getCalendar(b.ctx, december)).toEqual([]);
  });

  it("keeps an expected date only after the order date", async () => {
    const a = await household("Ana");
    const input = {
      supplier: "Tile Shop",
      orderedOn: "2026-11-30",
      items: [{ description: "Tile", quantity: "1", unitPrice: "50", lineId: a.materials }],
    };
    await invalid(createOrder(a.ctx, a.project, { ...input, expectedOn: "2026-11-29" }));
    const { id } = await createOrder(a.ctx, a.project, input);
    expect((await getOrder(a.ctx, id)).expectedOn).toBeNull();
    await updateOrder(a.ctx, id, { ...input, expectedOn: "2026-12-04" });
    expect((await getOrder(a.ctx, id)).expectedOn).toEqual(day("2026-12-04"));
  });

  it("works out today where the household is", async () => {
    const a = await household("Ana");
    // 2 AM on Dec 1 in London is still Nov 30 in Los Angeles.
    const now = new Date("2026-12-01T02:00:00Z");
    expect(await getTimeZonePreference(a.ctx)).toBe("UTC");
    expect(await getHouseholdToday(a.ctx, now)).toEqual(day("2026-12-01"));
    await setTimeZone(a.ctx, "America/Los_Angeles");
    expect(await getHouseholdToday(a.ctx, now)).toEqual(day("2026-11-30"));
  });
});
