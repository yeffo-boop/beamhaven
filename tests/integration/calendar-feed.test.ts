import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { setTimeZone } from "@/server/data/workspaces";
import { createAppointment } from "@/server/services/appointments";
import {
  calendarFeedFor,
  createCalendarLink,
  getCalendarLinkInfo,
  turnOffCalendarLink,
} from "@/server/services/calendar-feed";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const tokenOf = (url: string) => url.split("/").pop() ?? "";
const now = new Date("2026-11-24T16:00:00Z");

async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  await setTimeZone(ctx, "America/Chicago");
  const property = (await createProperty(ctx, { name: "House" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: `${name} kitchen`, status: "planning" })
  ).id;
  return { user, workspaceId, ctx, project };
}

describe("calendar feed (ADR-045)", () => {
  beforeEach(resetDatabase);

  it("serves the household's dated things to whoever holds the link", async () => {
    const a = await household("Alex");
    await createAppointment(a.ctx, {
      title: "Electrical rough-in",
      kind: "inspection",
      day: "2026-12-02",
      startTime: "9:30",
      endTime: "11:00",
      projectId: a.project,
    });
    await createTask(a.ctx, { title: "Pick tile", projectId: a.project, dueDate: "2026-12-05" });

    const url = await createCalendarLink(a.ctx);
    expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{43}$/);
    const ics = await calendarFeedFor(tokenOf(url), now);
    expect(ics).toContain("SUMMARY:Inspection: Electrical rough-in");
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20261202T093000");
    expect(ics).toContain("SUMMARY:Task due: Pick tile");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261205");
    expect(await getCalendarLinkInfo(a.ctx)).toMatchObject({ lastUsedAt: expect.any(Date) });
  });

  it("only ever shows the link holder's own household", async () => {
    const a = await household("Alex");
    const b = await household("Blair");
    await createTask(b.ctx, {
      title: "Blair's secret task",
      projectId: b.project,
      dueDate: "2026-12-05",
    });
    const ics = await calendarFeedFor(tokenOf(await createCalendarLink(a.ctx)), now);
    expect(ics).not.toContain("Blair");
  });

  it("stops the old link when a new one is made, or when it's turned off", async () => {
    const a = await household("Alex");
    const first = tokenOf(await createCalendarLink(a.ctx));
    const second = tokenOf(await createCalendarLink(a.ctx));
    expect(await calendarFeedFor(first, now)).toBeNull();
    expect(await calendarFeedFor(second, now)).not.toBeNull();
    await turnOffCalendarLink(a.ctx);
    expect(await calendarFeedFor(second, now)).toBeNull();
    expect(await getCalendarLinkInfo(a.ctx)).toBeNull();
  });

  it("stops working when the person leaves the household", async () => {
    const a = await household("Alex");
    const viewer = await createUser("Viewer");
    await addMember(a.workspaceId, viewer.id, "viewer");
    const token = tokenOf(await createCalendarLink(await contextFor(viewer.id, a.workspaceId)));
    expect(await calendarFeedFor(token, now)).not.toBeNull();

    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    await client.query("DELETE FROM memberships WHERE user_id = $1", [viewer.id]);
    await client.end();
    expect(await calendarFeedFor(token, now)).toBeNull();
  });

  it("refuses made-up links", async () => {
    await household("Alex");
    expect(await calendarFeedFor("x".repeat(43), now)).toBeNull();
    expect(await calendarFeedFor("../../etc/passwd", now)).toBeNull();
  });
});
