import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { listActivityFor } from "@/server/data/activity";
import {
  deletePhoto,
  getPhotos,
  readFileForDownload,
  UploadError,
  uploadPhoto,
} from "@/server/services/attachments";
import { NotFoundError } from "@/server/services/errors";
import {
  createProject,
  deleteProject,
  getProject,
  getProjects,
  linkProjectRooms,
  updateProject,
} from "@/server/services/projects";
import { createProperty, getProperties, getProperty } from "@/server/services/properties";
import {
  addOpening,
  createRoom,
  deleteRoom,
  getRoom,
  getRooms,
  removeOpening,
  updateRoom,
} from "@/server/services/rooms";
import { getStorage } from "@/server/storage/storage";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

// The first bytes of a real PNG, padded: enough for the type check.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const SVG = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`);

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

async function sql(text: string, values: unknown[]): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);

/**
 * Isolation tests for Milestone 3's records (CLAUDE.md): someone in
 * household A can read and change A's properties, projects, rooms and
 * photos, and every attempt on household B's behaves as if it doesn't exist.
 */
describe("properties, projects, rooms and photos", () => {
  let a: WorkspaceContext; // owner of household A
  let b: WorkspaceContext; // owner of household B
  let viewerA: WorkspaceContext;
  let propertyB: string;
  let projectB: string;
  let roomB: string;
  let photoB: { attachmentId: string; fileId: string };

  beforeEach(async () => {
    await resetDatabase();
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const vera = await createUser("Vera");
    const householdA = await createHousehold("Household A", alice.id);
    const householdB = await createHousehold("Household B", bob.id);
    await addMember(householdA, vera.id, "viewer");
    a = await contextFor(alice.id, householdA);
    b = await contextFor(bob.id, householdB);
    viewerA = await contextFor(vera.id, householdA);

    propertyB = (await createProperty(b, { name: "B's house" })).id;
    projectB = (
      await createProject(b, { propertyId: propertyB, name: "B kitchen", status: "planning" })
    ).id;
    roomB = (await createRoom(b, { propertyId: propertyB, name: "B kitchen", type: "kitchen" })).id;
    photoB = await uploadPhoto(b, { kind: "room", id: roomB }, { name: "b.png", bytes: PNG });
  });

  it("works within the household (the control for the checks below)", async () => {
    const property = (await createProperty(a, { name: "Our house", city: "Portland" })).id;
    const room = (
      await createRoom(a, {
        propertyId: property,
        name: "Kitchen",
        type: "kitchen",
        length: `12' 4"`,
        width: "10'",
        ceilingHeight: "8'",
      })
    ).id;
    const project = (
      await createProject(a, {
        propertyId: property,
        name: "Kitchen remodel",
        status: "planning",
        plannedStart: "2027-03-01",
        plannedEnd: "2027-05-01",
      })
    ).id;
    await linkProjectRooms(a, project, [{ roomId: room, plannedImprovements: "New cabinets" }]);
    await addOpening(a, room, { kind: "window", width: `36"`, height: `48"` });
    const photo = await uploadPhoto(
      a,
      { kind: "project", id: project },
      { name: "a.png", bytes: PNG },
    );

    expect((await getProperties(a)).map((p) => p.name)).toEqual(["Our house"]);
    expect((await getProjects(a)).map((p) => p.name)).toEqual(["Kitchen remodel"]);
    const detail = await getRoom(a, room);
    expect(detail.lengthMm).toBe(Math.round(148 * 25.4));
    expect(detail.enteredUnit).toBe("imperial");
    expect(detail.openings).toHaveLength(1);
    expect(detail.projects.map((p) => p.projectName)).toEqual(["Kitchen remodel"]);
    expect((await getProject(a, project)).rooms[0]?.plannedImprovements).toBe("New cabinets");
    expect(new Uint8Array((await readFileForDownload(a, photo.fileId)).bytes)).toEqual(PNG);
    expect((await listActivityFor(a, "project", project)).length).toBeGreaterThan(0);
  });

  it("lists only the household's own records", async () => {
    await createProperty(a, { name: "Our house" });
    expect((await getProperties(a)).map((p) => p.name)).toEqual(["Our house"]);
    expect(await getProjects(a)).toEqual([]);
    expect(await getRooms(a)).toEqual([]);
    expect(await getPhotos(a, { kind: "room", id: roomB })).toEqual([]);
  });

  it("treats another household's records as not found when reading", async () => {
    await notFound(getProperty(a, propertyB));
    await notFound(getProject(a, projectB));
    await notFound(getRoom(a, roomB));
    await notFound(readFileForDownload(a, photoB.fileId));
  });

  it("treats another household's records as not found when changing them", async () => {
    await notFound(
      updateProject(a, projectB, { propertyId: propertyB, name: "Mine now", status: "idea" }),
    );
    await notFound(
      updateRoom(a, roomB, { propertyId: propertyB, name: "Mine now", type: "other" }),
    );
    await notFound(addOpening(a, roomB, { kind: "door", width: "3'", height: "7'" }));
    await addOpening(b, roomB, { kind: "door", width: "3'", height: "7'" });
    const openingB = (await getRoom(b, roomB)).openings[0]?.id ?? "";
    await notFound(removeOpening(a, roomB, openingB));
    await notFound(linkProjectRooms(a, projectB, []));
    await notFound(deletePhoto(a, { kind: "room", id: roomB }, photoB.attachmentId));
    await notFound(deleteProject(a, projectB));
    await notFound(deleteRoom(a, roomB));
    // Nothing in B changed.
    expect((await getProject(b, projectB)).name).toBe("B kitchen");
    expect((await getRoom(b, roomB)).name).toBe("B kitchen");
    expect((await getRoom(b, roomB)).openings).toHaveLength(1);
    expect(await getPhotos(b, { kind: "room", id: roomB })).toHaveLength(1);
  });

  it("won't create records under another household's property, or attach to its records", async () => {
    await notFound(createProject(a, { propertyId: propertyB, name: "Sneaky", status: "idea" }));
    await notFound(createRoom(a, { propertyId: propertyB, name: "Sneaky", type: "other" }));
    await notFound(
      uploadPhoto(a, { kind: "property", id: propertyB }, { name: "x.png", bytes: PNG }),
    );
    expect(await getPhotos(b, { kind: "property", id: propertyB })).toEqual([]);
  });

  it("won't link another household's room to a project", async () => {
    const property = (await createProperty(a, { name: "Our house" })).id;
    const project = (await createProject(a, { propertyId: property, name: "Mine", status: "idea" }))
      .id;
    await notFound(linkProjectRooms(a, project, [{ roomId: roomB, plannedImprovements: null }]));
    expect((await getProject(a, project)).rooms).toEqual([]);
  });

  it("has the database refuse cross-household links even if the code forgot to check", async () => {
    const property = (await createProperty(a, { name: "Our house" })).id;
    const project = (await createProject(a, { propertyId: property, name: "Mine", status: "idea" }))
      .id;
    await expect(
      sql("INSERT INTO project_rooms (workspace_id, project_id, room_id) VALUES ($1, $2, $3)", [
        a.workspaceId,
        project,
        roomB,
      ]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        "INSERT INTO projects (id, workspace_id, property_id, name, updated_at) VALUES ('x', $1, $2, 'x', now())",
        [a.workspaceId, propertyB],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("lets viewers look but not change anything", async () => {
    const property = (await createProperty(a, { name: "Our house" })).id;
    expect((await getProperties(viewerA)).map((p) => p.name)).toEqual(["Our house"]);
    const forbidden = (promise: Promise<unknown>) =>
      expect(promise).rejects.toBeInstanceOf(PermissionError);
    await forbidden(createProperty(viewerA, { name: "Nope" }));
    await forbidden(createProject(viewerA, { propertyId: property, name: "Nope", status: "idea" }));
    await forbidden(createRoom(viewerA, { propertyId: property, name: "Nope", type: "other" }));
    await forbidden(
      uploadPhoto(viewerA, { kind: "property", id: property }, { name: "x.png", bytes: PNG }),
    );
  });
});

describe("photos", () => {
  let ctx: WorkspaceContext;
  let roomId: string;

  beforeEach(async () => {
    await resetDatabase();
    const alice = await createUser("Alice");
    ctx = await contextFor(alice.id, await createHousehold("Household A", alice.id));
    const property = (await createProperty(ctx, { name: "Our house" })).id;
    roomId = (await createRoom(ctx, { propertyId: property, name: "Bath", type: "bathroom" })).id;
  });

  it("refuses files that aren't photos, judged by their contents", async () => {
    const reject = (name: string, bytes: Uint8Array) =>
      expect(
        uploadPhoto(ctx, { kind: "room", id: roomId }, { name, bytes }),
      ).rejects.toBeInstanceOf(UploadError);
    await reject("drawing.svg", SVG);
    await reject("looks-like.png", SVG); // the name doesn't matter
    await reject("page.html", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    await reject("empty.jpg", new Uint8Array());
    expect(await getPhotos(ctx, { kind: "room", id: roomId })).toEqual([]);
  });

  it("stores the file under a random key and removes the bytes when deleted", async () => {
    const photo = await uploadPhoto(
      ctx,
      { kind: "room", id: roomId },
      { name: "../../etc/passwd.png", bytes: PNG },
    );
    const { file } = await readFileForDownload(ctx, photo.fileId);
    expect(file.originalName).toBe("passwd.png");
    expect(file.storageKey).toMatch(/^[A-Za-z0-9_-]+\/[a-f0-9]{64}$/);
    expect(await getStorage().exists(file.storageKey)).toBe(true);

    await deletePhoto(ctx, { kind: "room", id: roomId }, photo.attachmentId);
    expect(await getStorage().exists(file.storageKey)).toBe(false);
    await notFound(readFileForDownload(ctx, photo.fileId));
  });

  it("removes a room's photos from storage when the room is deleted", async () => {
    const photo = await uploadPhoto(
      ctx,
      { kind: "room", id: roomId },
      { name: "a.png", bytes: PNG },
    );
    const { file } = await readFileForDownload(ctx, photo.fileId);
    await deleteRoom(ctx, roomId);
    expect(await getStorage().exists(file.storageKey)).toBe(false);
  });
});
