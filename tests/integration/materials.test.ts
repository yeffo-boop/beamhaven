import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { getDocuments, uploadDocument } from "@/server/services/attachments";
import { getActivity } from "@/server/services/activity";
import { NotFoundError } from "@/server/services/errors";
import { getVendors } from "@/server/services/expenses";
import {
  changeMaterialStatus,
  createMaterial,
  deleteMaterial,
  getMaterial,
  getMaterialCategories,
  getMaterials,
  updateMaterial,
} from "@/server/services/materials";
import { createProject, deleteProject, linkProjectRooms } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom, deleteRoom } from "@/server/services/rooms";
import { createWarranty, getWarranties, getWarranty } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

async function sql(text: string, values: unknown[] = []): Promise<void> {
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
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);

const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");

async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const kitchen = (
    await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" })
  ).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen remodel", status: "planning" })
  ).id;
  await linkProjectRooms(ctx, project, [{ roomId: kitchen }]);
  return { user, workspaceId, ctx, property, kitchen, project };
}

type Household = Awaited<ReturnType<typeof household>>;

async function tile(h: Household, more: Record<string, string> = {}) {
  return (
    await createMaterial(h.ctx, {
      name: "Backsplash tile",
      category: "Tile",
      projectId: h.project,
      roomId: h.kitchen,
      supplier: "Tile Shop",
      brand: "Daltile",
      modelNumber: "RE15",
      colorFinish: "Arctic white, gloss",
      productUrl: "tileshop.com/re15",
      quantity: "2.5",
      unit: "box",
      unitPrice: "54.99",
      specs: "3 x 6 in, 10 sq ft per box",
      ...more,
    })
  ).id;
}

describe("materials", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records a product with its supplier, quantity and expected price", async () => {
    const a = await household("Ana");
    const id = await tile(a);
    const m = await getMaterial(a.ctx, id);
    expect(m).toMatchObject({
      name: "Backsplash tile",
      category: "Tile",
      projectName: "Kitchen remodel",
      roomName: "Kitchen",
      supplierName: "Tile Shop",
      productUrl: "https://tileshop.com/re15",
      quantityMilli: 2_500,
      unit: "box",
      unitPriceCents: 5_499n,
      status: "considering",
    });
    // The supplier is the same shop the budget's expenses use.
    expect((await getVendors(a.ctx)).map((v) => v.name)).toEqual(["Tile Shop"]);
    await tile(a, { name: "Grout", supplier: "tile shop", quantity: "", unitPrice: "" });
    expect(await getVendors(a.ctx)).toHaveLength(1);
    expect((await getMaterials(a.ctx, { projectId: a.project })).map((x) => x.name).sort()).toEqual(
      ["Backsplash tile", "Grout"],
    );
    expect(await getMaterialCategories(a.ctx)).toContain("Tile");
  });

  it("checks what's typed", async () => {
    const a = await household("Ana");
    await expect(tile(a, { name: "" })).rejects.toThrow(/Give the material a name/);
    await expect(tile(a, { quantity: "0" })).rejects.toThrow(/number above zero/);
    await expect(tile(a, { quantity: "1.2345" })).rejects.toThrow(/number above zero/);
    await expect(tile(a, { unitPrice: "-3" })).rejects.toThrow(/above zero|amount/);
    await expect(tile(a, { productUrl: "javascript:alert(1)" })).rejects.toThrow(/web address/);
    await expect(tile(a, { status: "lost" })).rejects.toThrow(/Choose a status/);
  });

  it("moves through its statuses, dating each change and logging it", async () => {
    const a = await household("Ana");
    const id = await tile(a);
    const first = (await getMaterial(a.ctx, id)).statusChangedAt;
    await new Promise((r) => setTimeout(r, 5));
    await changeMaterialStatus(a.ctx, id, "selected");
    const selected = await getMaterial(a.ctx, id);
    expect(selected.status).toBe("selected");
    expect(selected.statusChangedAt.getTime()).toBeGreaterThan(first.getTime());
    // Editing other fields leaves the status date alone.
    await updateMaterial(a.ctx, id, {
      name: "Backsplash tile",
      projectId: a.project,
      status: "selected",
      notes: "Ordered samples",
    });
    const edited = await getMaterial(a.ctx, id);
    expect(edited.statusChangedAt).toEqual(selected.statusChangedAt);
    expect(edited.supplierName).toBeNull();
    expect(edited.roomId).toBeNull();
    await changeMaterialStatus(a.ctx, id, "installed");
    await expect(changeMaterialStatus(a.ctx, id, "gone")).rejects.toThrow(/Choose a status/);
    const log = (await getActivity(a.ctx, "material", id)).map((e) => e.summary);
    expect(log).toEqual([
      "Marked as installed",
      "Marked as selected",
      "Added the material “Backsplash tile”",
    ]);
    expect((await getMaterials(a.ctx, { status: "installed" })).map((x) => x.id)).toEqual([id]);
  });

  it("keeps documents and warranties, and tidies up when deleted", async () => {
    const a = await household("Ana");
    const id = await tile(a);
    await uploadDocument(a.ctx, { kind: "material", id }, { name: "manual.pdf", bytes: PDF });
    expect(await getDocuments(a.ctx, { kind: "material", id })).toHaveLength(1);
    const onlyMaterial = (
      await createWarranty(a.ctx, { coverage: "Glaze, 10 years", materialId: id })
    ).id;
    const alsoRoom = (
      await createWarranty(a.ctx, {
        coverage: "Install, 1 year",
        materialId: id,
        roomId: a.kitchen,
      })
    ).id;
    expect((await getWarranties(a.ctx, { materialId: id })).map((w) => w.materialName)).toEqual([
      "Backsplash tile",
      "Backsplash tile",
    ]);
    await deleteMaterial(a.ctx, id);
    await notFound(getMaterial(a.ctx, id));
    // A warranty that was only on the material goes; one also on the room stays there.
    await notFound(getWarranty(a.ctx, onlyMaterial));
    expect(await getWarranty(a.ctx, alsoRoom)).toMatchObject({
      materialId: null,
      roomId: a.kitchen,
    });
  });

  it("stays in the household when its project or room is deleted", async () => {
    const a = await household("Ana");
    const id = await tile(a);
    await deleteProject(a.ctx, a.project);
    expect(await getMaterial(a.ctx, id)).toMatchObject({ projectId: null, roomId: a.kitchen });
    await deleteRoom(a.ctx, a.kitchen);
    expect(await getMaterial(a.ctx, id)).toMatchObject({ projectId: null, roomId: null });
  });

  it("keeps every household's materials to itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const bTile = await tile(b);
    expect(await getMaterials(a.ctx)).toEqual([]);
    await notFound(getMaterial(a.ctx, bTile));
    await notFound(updateMaterial(a.ctx, bTile, { name: "Mine" }));
    await notFound(changeMaterialStatus(a.ctx, bTile, "selected"));
    await notFound(deleteMaterial(a.ctx, bTile));
    await notFound(
      uploadDocument(a.ctx, { kind: "material", id: bTile }, { name: "x.pdf", bytes: PDF }),
    );
    // Someone else's project or room can't be used.
    await notFound(tile(a, { projectId: b.project }));
    await notFound(tile(a, { projectId: "", roomId: b.kitchen }));
    await notFound(createWarranty(a.ctx, { coverage: "X", materialId: bTile }));
    // In the database itself, too.
    const aTile = await tile(a);
    await createWarranty(a.ctx, { coverage: "Glaze", materialId: aTile });
    await expect(
      sql(`UPDATE materials SET project_id = $1 WHERE id = $2`, [b.project, aTile]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE warranties SET material_id = $1 WHERE workspace_id = $2`, [bTile, a.workspaceId]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE materials SET status = 'lost' WHERE id = $1`, [aTile]),
    ).rejects.toThrow(/materials_status_check/);
    await expect(
      sql(`UPDATE materials SET quantity_milli = 0 WHERE id = $1`, [aTile]),
    ).rejects.toThrow(/materials_quantity_check/);
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const id = await tile(a);
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await getMaterial(viewer, id)).name).toBe("Backsplash tile");
    expect(await getMaterials(viewer)).toHaveLength(1);
    await forbidden(tile({ ...a, ctx: viewer }));
    await forbidden(updateMaterial(viewer, id, { name: "X" }));
    await forbidden(changeMaterialStatus(viewer, id, "selected"));
    await forbidden(deleteMaterial(viewer, id));
  });
});
