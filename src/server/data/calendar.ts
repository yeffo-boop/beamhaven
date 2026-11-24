import "server-only";

import { listAppointments } from "./appointments";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { deliveryState, orderTitle } from "./orders";

/**
 * Everything with a date, for the calendar (Milestone 7, part 2, ADR-032).
 * Nothing here is stored twice: each entry is read from its own record.
 */

export type CalendarKind =
  | "appointment"
  | "inspection"
  | "delivery"
  | "other"
  | "task"
  | "milestone"
  | "delivered"
  | "expected"
  | "payment";

export type CalendarEntry = {
  /** Unique across kinds, for React keys. */
  key: string;
  kind: CalendarKind;
  day: Date;
  startTime: string | null;
  endTime: string | null;
  title: string;
  href: string;
  projectName: string | null;
  /** Finished, passed or paid: shown quieter. */
  done: boolean;
  /** A short extra fact, like "Failed" or "$1,200.00". */
  note: string | null;
  /** For a task given to a household member: who, so only they are reminded. */
  assigneeUserId?: string | null;
};

export type CalendarRange = { from: Date; to: Date; projectId?: string };

const APPOINTMENT_KINDS = new Set<CalendarKind>(["appointment", "inspection", "delivery", "other"]);

export async function listCalendarEntries(
  ctx: WorkspaceContext,
  range: CalendarRange,
): Promise<CalendarEntry[]> {
  const ws = ctx.workspaceId;
  const day = { gte: range.from, lte: range.to };
  const project = range.projectId ? { projectId: range.projectId } : {};
  const prisma = getPrisma();

  const [appointments, tasks, milestones, deliveries, expected, bills] = await Promise.all([
    listAppointments(ctx, { from: range.from, to: range.to, ...project }),
    prisma.task.findMany({
      where: { workspaceId: ws, dueDate: day, ...project },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assigneeUserId: true,
        project: { select: { name: true } },
      },
      take: 500,
    }),
    prisma.milestone.findMany({
      where: { workspaceId: ws, targetDate: day, ...project },
      select: {
        id: true,
        name: true,
        targetDate: true,
        project: { select: { name: true } },
        tasks: { select: { status: true } },
      },
      take: 200,
    }),
    prisma.delivery.findMany({
      where: { workspaceId: ws, deliveredOn: day, order: { ...project } },
      select: {
        id: true,
        orderId: true,
        deliveredOn: true,
        order: {
          select: {
            orderNumber: true,
            supplier: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
      },
      take: 300,
    }),
    prisma.order.findMany({
      where: { workspaceId: ws, expectedOn: day, ...project },
      select: {
        id: true,
        orderNumber: true,
        expectedOn: true,
        supplier: { select: { name: true } },
        project: { select: { name: true } },
        items: {
          select: { quantityMilli: true, deliveryItems: { select: { quantityMilli: true } } },
        },
      },
      take: 300,
    }),
    // Bills that go out, not refunds. A project's are the ones charged to its lines.
    prisma.expense.findMany({
      where: {
        workspaceId: ws,
        dueDate: day,
        totalCents: { gt: 0 },
        ...(range.projectId
          ? { allocations: { some: { line: { projectId: range.projectId } } } }
          : {}),
      },
      select: {
        id: true,
        description: true,
        dueDate: true,
        totalCents: true,
        payments: { select: { amountCents: true } },
        allocations: { select: { line: { select: { project: { select: { name: true } } } } } },
      },
      take: 300,
    }),
  ]);

  const entries: CalendarEntry[] = [];
  for (const a of appointments) {
    entries.push({
      key: `appointment:${a.id}`,
      kind: APPOINTMENT_KINDS.has(a.kind as CalendarKind) ? (a.kind as CalendarKind) : "other",
      day: a.day,
      startTime: a.startTime,
      endTime: a.endTime,
      title: a.title,
      href: `/appointments/${a.id}`,
      projectName: a.projectName,
      done: a.outcome === "passed",
      note: a.outcome === "passed" ? "Passed" : a.outcome === "failed" ? "Failed" : null,
    });
  }
  for (const t of tasks) {
    if (!t.dueDate) continue;
    entries.push({
      key: `task:${t.id}`,
      kind: "task",
      day: t.dueDate,
      startTime: null,
      endTime: null,
      title: t.title,
      href: `/tasks/${t.id}`,
      projectName: t.project?.name ?? null,
      done: t.status === "done",
      note: t.status === "done" ? "Done" : "Due",
      assigneeUserId: t.assigneeUserId,
    });
  }
  for (const m of milestones) {
    if (!m.targetDate) continue;
    const done = m.tasks.length > 0 && m.tasks.every((t) => t.status === "done");
    entries.push({
      key: `milestone:${m.id}`,
      kind: "milestone",
      day: m.targetDate,
      startTime: null,
      endTime: null,
      title: m.name,
      href: `/milestones/${m.id}`,
      projectName: m.project.name,
      done,
      note: done ? "Reached" : "Target",
    });
  }
  for (const d of deliveries) {
    entries.push({
      key: `delivered:${d.id}`,
      kind: "delivered",
      day: d.deliveredOn,
      startTime: null,
      endTime: null,
      title: orderTitle(d.order.supplier.name, d.order.orderNumber),
      href: `/orders/${d.orderId}`,
      projectName: d.order.project.name,
      done: true,
      note: "Delivered",
    });
  }
  for (const o of expected) {
    if (!o.expectedOn) continue;
    const state = deliveryState(
      o.items.map((i) => ({
        quantityMilli: i.quantityMilli,
        deliveredMilli: i.deliveryItems.reduce((sum, d) => sum + d.quantityMilli, 0),
      })),
    );
    // Once it has all arrived, the delivery itself is on the calendar instead.
    if (state === "all") continue;
    entries.push({
      key: `expected:${o.id}`,
      kind: "expected",
      day: o.expectedOn,
      startTime: null,
      endTime: null,
      title: orderTitle(o.supplier.name, o.orderNumber),
      href: `/orders/${o.id}`,
      projectName: o.project.name,
      done: false,
      note: state === "partly" ? "Rest expected" : "Expected",
    });
  }
  for (const e of bills) {
    if (!e.dueDate) continue;
    const paid = e.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    if (paid >= e.totalCents) continue;
    const projects = [...new Set(e.allocations.map((a) => a.line.project.name))];
    entries.push({
      key: `payment:${e.id}`,
      kind: "payment",
      day: e.dueDate,
      startTime: null,
      endTime: null,
      title: e.description,
      href: `/budget/expenses/${e.id}`,
      projectName: projects.length === 1 ? (projects[0] ?? null) : null,
      done: false,
      note: "Payment due",
    });
  }

  // By day, then timed entries in time order after the all-day ones.
  return entries.sort(
    (a, b) =>
      a.day.getTime() - b.day.getTime() ||
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.title.localeCompare(b.title),
  );
}
