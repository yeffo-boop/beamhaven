import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  findProperty,
  insertProperty,
  listProperties,
  type PropertySummary,
  updatePropertyRow,
} from "@/server/data/properties";

import { NotFoundError } from "./errors";
import { type FormInput, propertyInput } from "./inputs";

export type PropertyInput = FormInput<typeof propertyInput>;

export async function getProperties(ctx: WorkspaceContext): Promise<PropertySummary[]> {
  assertCan(ctx, "records:view");
  return listProperties(ctx);
}

export async function getProperty(ctx: WorkspaceContext, id: string): Promise<PropertySummary> {
  assertCan(ctx, "records:view");
  const property = await findProperty(ctx, id);
  if (!property) throw new NotFoundError("property");
  return property;
}

export async function createProperty(
  ctx: WorkspaceContext,
  input: PropertyInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = propertyInput.parse(input);
  const { id } = await insertProperty(ctx, fields);
  await recordActivity(ctx, {
    action: "property.created",
    entityType: "property",
    entityId: id,
    summary: `Added the property “${fields.name}”`,
  });
  return { id };
}

export async function updateProperty(
  ctx: WorkspaceContext,
  id: string,
  input: PropertyInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const fields = propertyInput.parse(input);
  if (!(await updatePropertyRow(ctx, id, fields))) throw new NotFoundError("property");
  await recordActivity(ctx, {
    action: "property.updated",
    entityType: "property",
    entityId: id,
    summary: "Updated the property details",
  });
}
