"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { assertCan, requireWorkspace } from "@/server/auth/workspace";
import { setMeasurementSystem } from "@/server/data/workspaces";
import { deletePhoto } from "@/server/services/attachments";
import {
  createProject,
  deleteProject,
  linkProjectRooms,
  updateProject,
} from "@/server/services/projects";
import { createProperty, updateProperty } from "@/server/services/properties";
import {
  addOpening,
  createRoom,
  deleteRoom,
  removeOpening,
  updateRoom,
} from "@/server/services/rooms";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/**
 * Server Actions for properties, projects and rooms. They stay thin: read
 * the form, call the service (which checks permissions and validates), and
 * turn known errors into messages next to the fields.
 */

// --- Properties ------------------------------------------------------------

function propertyFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    notes: text(formData, "notes"),
  };
}

export async function savePropertyAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  let createdId: string | null = null;
  try {
    if (id) await updateProperty(ctx, id, propertyFields(formData));
    else createdId = (await createProperty(ctx, propertyFields(formData))).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  if (createdId) {
    // The first property was made from the Projects or Rooms page: go back there.
    redirect(safeReturnPath(text(formData, "returnTo")) ?? `/properties/${createdId}`);
  }
  refresh();
  return { status: "saved" };
}

/** Only our own section pages, never a link to somewhere else. */
function safeReturnPath(path: string): string | null {
  return ["/projects", "/rooms", "/settings"].includes(path) ? path : null;
}

// --- Projects --------------------------------------------------------------

function projectFields(formData: FormData) {
  return {
    propertyId: text(formData, "propertyId"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    status: text(formData, "status"),
    plannedStart: text(formData, "plannedStart"),
    plannedEnd: text(formData, "plannedEnd"),
    actualStart: text(formData, "actualStart"),
    actualEnd: text(formData, "actualEnd"),
  };
}

export async function saveProjectAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const existingId = text(formData, "id");
  let id: string;
  try {
    if (existingId) {
      await updateProject(ctx, existingId, projectFields(formData));
      id = existingId;
    } else {
      id = (await createProject(ctx, projectFields(formData))).id;
    }
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/projects/${id}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await deleteProject(ctx, id);
  } catch (error) {
    problemRedirect(`/projects/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect("/projects");
}

export async function saveProjectRoomsAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const projectId = idFrom(formData);
  const links = formData
    .getAll("roomId")
    .filter((value): value is string => typeof value === "string")
    .map((roomId) => ({ roomId, plannedImprovements: text(formData, `plan-${roomId}`) }));
  try {
    await linkProjectRooms(ctx, projectId, links);
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

// --- Rooms -----------------------------------------------------------------

function roomFields(formData: FormData) {
  return {
    propertyId: text(formData, "propertyId"),
    name: text(formData, "name"),
    type: text(formData, "type"),
    floorLevel: text(formData, "floorLevel"),
    length: text(formData, "length"),
    width: text(formData, "width"),
    ceilingHeight: text(formData, "ceilingHeight"),
    description: text(formData, "description"),
    notes: text(formData, "notes"),
  };
}

export async function saveRoomAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const existingId = text(formData, "id");
  let id: string;
  try {
    if (existingId) {
      await updateRoom(ctx, existingId, roomFields(formData));
      id = existingId;
    } else {
      id = (await createRoom(ctx, roomFields(formData))).id;
    }
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/rooms/${id}`);
}

export async function deleteRoomAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await deleteRoom(ctx, id);
  } catch (error) {
    problemRedirect(`/rooms/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect("/rooms");
}

export async function addOpeningAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addOpening(ctx, idFrom(formData, "roomId"), {
      kind: text(formData, "kind"),
      label: text(formData, "label"),
      width: text(formData, "width"),
      height: text(formData, "height"),
      sillHeight: text(formData, "sillHeight"),
      notes: text(formData, "notes"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function removeOpeningAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await removeOpening(ctx, idFrom(formData, "roomId"), idFrom(formData, "openingId"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

// --- Photos ----------------------------------------------------------------

const targetKind = z.enum(["property", "project", "room", "expense", "contractor", "warranty"]);

export async function deletePhotoAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const kind = targetKind.safeParse(formData.get("targetKind"));
  if (!kind.success) notFound();
  try {
    await deletePhoto(
      ctx,
      { kind: kind.data, id: idFrom(formData, "targetId") },
      idFrom(formData, "attachmentId"),
    );
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

// --- Household preferences -------------------------------------------------

export async function setMeasurementSystemAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const parsed = z.enum(["imperial", "metric"]).safeParse(formData.get("measurementSystem"));
  if (!parsed.success) return { status: "error", message: "Choose feet and inches or metric." };
  try {
    assertCan(ctx, "workspace:manage");
  } catch (error) {
    return asFormResult(error, formData);
  }
  await setMeasurementSystem(ctx, parsed.data);
  refresh();
  return { status: "saved" };
}
