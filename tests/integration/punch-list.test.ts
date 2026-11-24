import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { getDocuments, uploadDocument } from "@/server/services/attachments";
import { createContractor, deleteContractor } from "@/server/services/contractors";
import { NotFoundError } from "@/server/services/errors";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import {
  createPunchItem,
  deletePunchItem,
  getPunchItem,
  getPunchList,
  punchSummary,
  setPunchStatus,
  updatePunchItem,
} from "@/server/services/punch-list";
import { createRoom, deleteRoom } from "@/server/services/rooms";
import { getStorage } from "@/server/storage/storage";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);

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
  const painter = (await createContractor(ctx, { name: `${name} Painting`, status: "active" })).id;
  return { user, workspaceId, ctx, room, project, painter };
}

describe("punch list (ADR-047)", () => {
  beforeEach(resetDatabase);

  it("goes from open to fixed to signed off, and can be reopened", async () => {
    const a = await household("Alex");
    const { id } = await createPunchItem(a.ctx, a.project, {
      title: "Touch up paint",
      roomId: a.room,
      contractorId: a.painter,
    });
    let item = await getPunchItem(a.ctx, id);
    expect(item).toMatchObject({
      status: "open",
      roomName: "Kitchen",
      contractorName: "Alex Painting",
    });

    await setPunchStatus(a.ctx, id, "fixed");
    item = await getPunchItem(a.ctx, id);
    expect(item.status).toBe("fixed");
    expect(item.fixedAt).toBeInstanceOf(Date);

    await setPunchStatus(a.ctx, id, "signed_off");
    item = await getPunchItem(a.ctx, id);
    expect(item).toMatchObject({ status: "signed_off", signedOffByName: "Alex" });

    await setPunchStatus(a.ctx, id, "open");
    item = await getPunchItem(a.ctx, id);
    expect(item).toMatchObject({ status: "open", fixedAt: null, signedOffAt: null });

    await expect(setPunchStatus(a.ctx, id, "done")).rejects.toBeInstanceOf(ZodError);
    await expect(createPunchItem(a.ctx, a.project, { title: " " })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(punchSummary(await getPunchList(a.ctx, a.project))).toEqual({
      open: 1,
      fixed: 0,
      signedOff: 0,
    });
  });

  it("keeps each household's punch list to itself", async () => {
    const a = await household("Alex");
    const b = await household("Blair");
    const { id } = await createPunchItem(a.ctx, a.project, { title: "Loose outlet cover" });

    await notFound(getPunchItem(b.ctx, id));
    await notFound(updatePunchItem(b.ctx, id, { title: "Changed" }));
    await notFound(setPunchStatus(b.ctx, id, "fixed"));
    await notFound(deletePunchItem(b.ctx, id));
    await notFound(
      getDocuments(b.ctx, { kind: "punch_item", id }).then(() => getPunchItem(b.ctx, id)),
    );
    await notFound(
      uploadDocument(b.ctx, { kind: "punch_item", id }, { name: "x.png", bytes: PNG }),
    );
    expect(await getPunchList(b.ctx, a.project)).toEqual([]);

    // Can't add to another household's project, or point at its room or contractor.
    await notFound(createPunchItem(b.ctx, a.project, { title: "Sneaky" }));
    await notFound(createPunchItem(b.ctx, b.project, { title: "Sneaky", roomId: a.room }));
    await notFound(updatePunchItem(a.ctx, id, { title: "x", contractorId: b.painter }));

    // The database refuses a cross-household room even if the code forgot to check.
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await expect(
        client.query("UPDATE punch_items SET room_id = $1 WHERE id = $2", [b.room, id]),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
    expect((await getPunchItem(a.ctx, id)).title).toBe("Loose outlet cover");
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Alex");
    const viewer = await createUser("Viewer");
    await addMember(a.workspaceId, viewer.id, "viewer");
    const v = await contextFor(viewer.id, a.workspaceId);
    const { id } = await createPunchItem(a.ctx, a.project, { title: "Caulk the tub" });

    expect((await getPunchItem(v, id)).title).toBe("Caulk the tub");
    await expect(createPunchItem(v, a.project, { title: "x" })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(setPunchStatus(v, id, "fixed")).rejects.toBeInstanceOf(PermissionError);
    await expect(deletePunchItem(v, id)).rejects.toBeInstanceOf(PermissionError);
  });

  it("removes photos with the item, and with the project", async () => {
    const a = await household("Alex");
    const first = await createPunchItem(a.ctx, a.project, { title: "Scuffed floor" });
    const second = await createPunchItem(a.ctx, a.project, { title: "Gap in trim" });
    await uploadDocument(
      a.ctx,
      { kind: "punch_item", id: first.id },
      { name: "a.png", bytes: PNG },
    );
    await uploadDocument(
      a.ctx,
      { kind: "punch_item", id: second.id },
      { name: "b.png", bytes: PNG },
    );
    expect(await getDocuments(a.ctx, { kind: "punch_item", id: first.id })).toHaveLength(1);
    expect((await getPunchItem(a.ctx, first.id)).photoCount).toBe(1);

    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    const keys = async () =>
      (await client.query<{ storage_key: string }>("SELECT storage_key FROM files")).rows.map(
        (r) => r.storage_key,
      );
    try {
      const [keyA, keyB] = await keys();
      await deletePunchItem(a.ctx, first.id);
      expect(await keys()).toHaveLength(1);
      await deleteProject(a.ctx, a.project);
      expect(await keys()).toHaveLength(0);
      for (const key of [keyA, keyB]) {
        await expect(getStorage().get(key ?? "")).rejects.toThrow();
      }
    } finally {
      await client.end();
    }
  });

  it("keeps items when their room or contractor is deleted", async () => {
    const a = await household("Alex");
    const { id } = await createPunchItem(a.ctx, a.project, {
      title: "Paint",
      roomId: a.room,
      contractorId: a.painter,
    });
    await deleteContractor(a.ctx, a.painter);
    await deleteRoom(a.ctx, a.room);
    expect(await getPunchItem(a.ctx, id)).toMatchObject({ roomId: null, contractorId: null });
  });
});
