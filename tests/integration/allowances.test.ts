import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import {
  getAllowance,
  getAllowanceChoices,
  setMaterialAllowance,
} from "@/server/services/allowances";
import { createLine, deleteLine, getCategories } from "@/server/services/budget";
import { NotFoundError } from "@/server/services/errors";
import { createMaterial, getMaterial, updateMaterial } from "@/server/services/materials";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

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
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "planning" })
  ).id;
  const other = (
    await createProject(ctx, { propertyId: property, name: "Bathroom", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const materials = categories.find((c) => c.name === "Materials")?.id ?? "";
  const tile = (
    await createLine(ctx, {
      projectId: project,
      categoryId: materials,
      name: "Tile",
      planned: "3000",
    })
  ).id;
  const bathLine = (
    await createLine(ctx, { projectId: other, categoryId: materials, planned: "500" })
  ).id;
  const material = (input: {
    name: string;
    status: string;
    quantity?: string;
    unitPrice?: string;
  }) => createMaterial(ctx, { projectId: project, ...input }).then((m) => m.id);
  return { user, workspaceId, ctx, project, other, tile, bathLine, material };
}

describe("allowances (ADR-046)", () => {
  beforeEach(resetDatabase);

  it("adds up the materials chosen against a line and compares them with its budget", async () => {
    const a = await household("Alex");
    const floor = await a.material({
      name: "Floor tile",
      status: "selected",
      quantity: "120",
      unitPrice: "12.50",
    });
    const wall = await a.material({
      name: "Wall tile",
      status: "considering",
      quantity: "60",
      unitPrice: "30",
    });
    await setMaterialAllowance(a.ctx, floor, a.tile);
    await setMaterialAllowance(a.ctx, wall, a.tile);

    let allowance = await getAllowance(a.ctx, a.tile);
    expect(allowance.check).toMatchObject({
      allowance: 300_000n,
      chosen: 150_000n,
      considering: 180_000n,
      remaining: 150_000n,
      over: false,
    });
    expect(allowance.materials.map((m) => m.name).sort()).toEqual(["Floor tile", "Wall tile"]);

    await updateMaterial(a.ctx, wall, {
      name: "Wall tile",
      projectId: a.project,
      status: "selected",
      quantity: "60",
      unitPrice: "30",
    });
    allowance = await getAllowance(a.ctx, a.tile);
    expect(allowance.check).toMatchObject({ chosen: 330_000n, remaining: -30_000n, over: true });

    await setMaterialAllowance(a.ctx, wall, "");
    expect((await getAllowance(a.ctx, a.tile)).materials).toHaveLength(1);
  });

  it("only offers and accepts lines on the material's own project", async () => {
    const a = await household("Alex");
    const m = await a.material({ name: "Tile", status: "selected" });
    const choices = await getAllowanceChoices(a.ctx, a.project);
    expect(choices.map((c) => c.value)).toEqual([a.tile]);
    await notFound(setMaterialAllowance(a.ctx, m, a.bathLine));

    // Moving the material to another project takes it off the old allowance.
    await setMaterialAllowance(a.ctx, m, a.tile);
    await updateMaterial(a.ctx, m, { name: "Tile", projectId: a.other, status: "selected" });
    expect((await getMaterial(a.ctx, m)).budgetLineId).toBeNull();
  });

  it("keeps households apart, and viewers read-only", async () => {
    const a = await household("Alex");
    const b = await household("Blair");
    const mine = await a.material({ name: "Tile", status: "selected" });
    const theirs = await b.material({ name: "Tile", status: "selected" });

    await notFound(setMaterialAllowance(a.ctx, mine, b.tile));
    await notFound(setMaterialAllowance(b.ctx, mine, b.tile));
    await notFound(getAllowance(b.ctx, a.tile));
    await setMaterialAllowance(b.ctx, theirs, b.tile);
    expect((await getAllowance(a.ctx, a.tile)).materials).toEqual([]);

    const viewer = await createUser("Viewer");
    await addMember(a.workspaceId, viewer.id, "viewer");
    const v = await contextFor(viewer.id, a.workspaceId);
    await expect(setMaterialAllowance(v, mine, a.tile)).rejects.toBeInstanceOf(PermissionError);
    expect((await getAllowance(v, a.tile)).materials).toEqual([]);
  });

  it("lets go of materials when the line or its project is deleted", async () => {
    const a = await household("Alex");
    const m = await a.material({ name: "Tile", status: "selected" });
    const spare = (
      await createLine(a.ctx, {
        projectId: a.project,
        categoryId: (await getCategories(a.ctx)).find((c) => c.name === "Fixtures")?.id ?? "",
      })
    ).id;
    await setMaterialAllowance(a.ctx, m, spare);
    await deleteLine(a.ctx, spare);
    expect((await getMaterial(a.ctx, m)).budgetLineId).toBeNull();

    await setMaterialAllowance(a.ctx, m, a.tile);
    await deleteProject(a.ctx, a.project);
    expect(await getMaterial(a.ctx, m)).toMatchObject({ budgetLineId: null, projectId: null });
  });
});
