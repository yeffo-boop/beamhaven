import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

export type PropertyFields = {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
};

export type PropertySummary = PropertyFields & { id: string };

const select = {
  id: true,
  name: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  notes: true,
} as const;

export async function listProperties(ctx: WorkspaceContext): Promise<PropertySummary[]> {
  return getPrisma().property.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "asc" },
    select,
  });
}

/** Null when it doesn't exist or belongs to another household (callers answer 404). */
export async function findProperty(
  ctx: WorkspaceContext,
  id: string,
): Promise<PropertySummary | null> {
  return getPrisma().property.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select });
}

export async function insertProperty(
  ctx: WorkspaceContext,
  fields: PropertyFields,
): Promise<{ id: string }> {
  return getPrisma().property.create({
    data: { id: newId(), workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
    select: { id: true },
  });
}

/** Returns false when there was nothing in this household to update. */
export async function updatePropertyRow(
  ctx: WorkspaceContext,
  id: string,
  fields: PropertyFields,
): Promise<boolean> {
  const result = await getPrisma().property.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}
