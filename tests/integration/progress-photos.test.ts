import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import {
  getPhotos,
  updatePhotoDetails,
  uploadDocument,
  uploadPhoto,
} from "@/server/services/attachments";
import { createContractor } from "@/server/services/contractors";
import { NotFoundError } from "@/server/services/errors";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom } from "@/server/services/rooms";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const invalid = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ZodError);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%x\n");

async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const room = (await createRoom(ctx, { propertyId: property, name: "Bath", type: "bathroom" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Bath", status: "in_progress" })
  ).id;
  return { user, workspaceId, ctx, property, room, project };
}

describe("progress photos", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records the phase and day on upload, and both can change later", async () => {
    const a = await household("Ana");
    const room = { kind: "room" as const, id: a.room };
    const before = await uploadPhoto(
      a.ctx,
      room,
      { name: "old-tub.png", bytes: PNG },
      { phase: "before", takenOn: "2026-10-01" },
    );
    const unsorted = await uploadPhoto(a.ctx, room, { name: "x.png", bytes: PNG });

    expect(await getPhotos(a.ctx, room)).toMatchObject([
      { id: before.attachmentId, phase: "before", takenOn: new Date("2026-10-01T00:00:00Z") },
      { id: unsorted.attachmentId, phase: null, takenOn: null },
    ]);

    await updatePhotoDetails(a.ctx, room, unsorted.attachmentId, {
      caption: "New tile",
      phase: "after",
      takenOn: "2026-11-20",
    });
    expect((await getPhotos(a.ctx, room))[1]).toMatchObject({
      caption: "New tile",
      phase: "after",
      takenOn: new Date("2026-11-20T00:00:00Z"),
    });
    // Back to not sorted.
    await updatePhotoDetails(a.ctx, room, unsorted.attachmentId, { phase: "", takenOn: "" });
    expect((await getPhotos(a.ctx, room))[1]).toMatchObject({
      caption: null,
      phase: null,
      takenOn: null,
    });
  });

  it("refuses an unknown phase or a bad date", async () => {
    const a = await household("Ana");
    const project = { kind: "project" as const, id: a.project };
    await invalid(uploadPhoto(a.ctx, project, { name: "x.png", bytes: PNG }, { phase: "someday" }));
    await invalid(
      uploadPhoto(a.ctx, project, { name: "x.png", bytes: PNG }, { takenOn: "2026-02-30" }),
    );
    expect(await getPhotos(a.ctx, project)).toEqual([]);
    const { attachmentId } = await uploadPhoto(a.ctx, project, { name: "x.png", bytes: PNG });
    await invalid(updatePhotoDetails(a.ctx, project, attachmentId, { phase: "later" }));
  });

  it("only sets details on that record's photos", async () => {
    const a = await household("Ana");
    const { attachmentId } = await uploadPhoto(
      a.ctx,
      { kind: "room", id: a.room },
      { name: "x.png", bytes: PNG },
    );
    // The right photo, but named through another record.
    await notFound(
      updatePhotoDetails(a.ctx, { kind: "project", id: a.project }, attachmentId, {
        phase: "after",
      }),
    );
    // A contractor's document isn't a progress photo.
    const contractor = (await createContractor(a.ctx, { name: "Tiler", status: "active" })).id;
    const doc = await uploadDocument(
      a.ctx,
      { kind: "contractor", id: contractor },
      { name: "license.pdf", bytes: PDF },
    );
    await notFound(
      updatePhotoDetails(a.ctx, { kind: "contractor", id: contractor }, doc.attachmentId, {
        phase: "before",
      }),
    );
  });

  it("lets viewers look but not change details", async () => {
    const a = await household("Ana");
    const room = { kind: "room" as const, id: a.room };
    const { attachmentId } = await uploadPhoto(a.ctx, room, { name: "x.png", bytes: PNG });
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect(await getPhotos(viewer, room)).toHaveLength(1);
    await expect(
      updatePhotoDetails(viewer, room, attachmentId, { phase: "after" }),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      uploadPhoto(viewer, room, { name: "x.png", bytes: PNG }, { phase: "after" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("keeps each household's photos to itself", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const bRoom = { kind: "room" as const, id: b.room };
    const { attachmentId } = await uploadPhoto(b.ctx, bRoom, { name: "b.png", bytes: PNG });
    await notFound(updatePhotoDetails(a.ctx, bRoom, attachmentId, { phase: "after" }));
    await notFound(
      updatePhotoDetails(a.ctx, { kind: "room", id: a.room }, attachmentId, { phase: "after" }),
    );
    expect((await getPhotos(b.ctx, bRoom))[0]?.phase).toBeNull();
  });
});
