import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { setTimeZone } from "@/server/data/workspaces";
import { createAppointment, deleteAppointment } from "@/server/services/appointments";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import {
  createDueReminders,
  getReminders,
  getUnreadReminderCount,
  markReminderRead,
} from "@/server/services/reminders";
import { createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

/** Ana (owner), Ben (member) and Vera (viewer), with a kitchen project. */
async function household(name: string) {
  const ana = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, ana.id);
  const ben = await createUser(`${name}'s partner`);
  const vera = await createUser(`${name}'s viewer`);
  await addMember(workspaceId, ben.id, "member");
  await addMember(workspaceId, vera.id, "viewer");
  const ctx = await contextFor(ana.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  return {
    workspaceId,
    ana,
    ben,
    vera,
    ctx,
    benCtx: await contextFor(ben.id, workspaceId),
    veraCtx: await contextFor(vera.id, workspaceId),
    project,
  };
}

// 8 AM on Dec 1 in London, midnight in Los Angeles.
const MORNING_UTC = new Date("2026-12-01T08:00:00Z");

describe("reminders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("reminds the right people once, the day before", async () => {
    const a = await household("Ana");
    await createAppointment(a.ctx, {
      title: "Rough-in inspection",
      kind: "inspection",
      day: "2026-12-02",
      projectId: a.project,
    });
    await createTask(a.ctx, {
      title: "Pick grout",
      projectId: a.project,
      dueDate: "2026-12-02",
      assignee: `user:${a.ben.id}`,
    });
    await createAppointment(a.ctx, { title: "Next week", day: "2026-12-08" });

    expect(await createDueReminders(MORNING_UTC)).toBe(3);
    // Running again (the worker runs every 15 minutes) adds nothing.
    expect(await createDueReminders(MORNING_UTC)).toBe(0);

    expect((await getReminders(a.ctx)).map((r) => [r.kind, r.title])).toEqual([
      ["inspection", "Rough-in inspection"],
    ]);
    expect((await getReminders(a.benCtx)).map((r) => r.title).sort()).toEqual([
      "Pick grout",
      "Rough-in inspection",
    ]);
    // Viewers can't act on anything, so they aren't reminded.
    expect(await getReminders(a.veraCtx)).toEqual([]);

    // Even if the appointment is deleted, the reminder still reads sensibly.
    const [first] = await getReminders(a.ctx);
    expect(first?.href).toMatch(/^\/appointments\//);
  });

  it("waits for 7 AM where the household is", async () => {
    const a = await household("Ana");
    await setTimeZone(a.ctx, "America/Los_Angeles");
    // In Los Angeles it's midnight on Dec 1, so tomorrow is Dec 2.
    await createAppointment(a.ctx, { title: "Plumber", day: "2026-12-02" });
    expect(await createDueReminders(MORNING_UTC)).toBe(0);
    // 7:05 AM in Los Angeles.
    expect(await createDueReminders(new Date("2026-12-01T15:05:00Z"))).toBe(2);
  });

  it("lets each person mark only their own reminders read", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const { id } = await createAppointment(a.ctx, { title: "Plumber", day: "2026-12-02" });
    await createAppointment(b.ctx, { title: "Painter", day: "2026-12-02" });
    await createDueReminders(MORNING_UTC);

    const [anas] = await getReminders(a.ctx);
    const [bens] = await getReminders(a.benCtx);
    expect(await getReminders(b.ctx)).toHaveLength(1);
    expect((await getReminders(b.ctx))[0]?.title).toBe("Painter");

    // Someone else's id does nothing, in this household or another.
    await markReminderRead(a.benCtx, anas?.id);
    await markReminderRead(b.ctx, anas?.id);
    expect(await getUnreadReminderCount(a.ctx)).toBe(1);

    await markReminderRead(a.ctx, anas?.id);
    expect(await getUnreadReminderCount(a.ctx)).toBe(0);
    expect(await getUnreadReminderCount(a.benCtx)).toBe(1);
    await markReminderRead(a.benCtx);
    expect(await getReminders(a.benCtx, { unreadOnly: true })).toEqual([]);
    expect(bens?.title).toBe("Plumber");

    // A viewer may mark their own read (there are none), but changes nothing else.
    await markReminderRead(a.veraCtx);
    await deleteAppointment(a.ctx, id);
    expect(await getReminders(a.ctx)).toHaveLength(1);
  });

  it("can't be used by someone outside the household", async () => {
    const a = await household("Ana");
    const stranger = await createUser("Stranger");
    expect(await resolveWorkspaceContext(stranger.id, a.workspaceId)).toBeNull();
    // The worker's own context is read-only.
    const { systemWorkspaceContext } = await import("@/server/auth/system-context");
    await expect(
      createAppointment(systemWorkspaceContext(a.workspaceId), { title: "X", day: "2026-12-02" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
