"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  createAppointment,
  deleteAppointment,
  getAppointment,
  updateAppointment,
} from "@/server/services/appointments";

import type { FormResult } from "./account";
import { asFormResult, idFrom, text } from "./helpers";

/** Server Actions for appointments and inspections (Milestone 7, part 2). */

const FIELDS = [
  "title",
  "kind",
  "day",
  "startTime",
  "endTime",
  "location",
  "projectId",
  "roomId",
  "contractorId",
  "outcome",
  "notes",
] as const;

function appointmentInput(formData: FormData) {
  return Object.fromEntries(FIELDS.map((name) => [name, text(formData, name)]));
}

export async function saveAppointmentAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  try {
    if (id) await updateAppointment(ctx, id, appointmentInput(formData));
    else await createAppointment(ctx, appointmentInput(formData));
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function deleteAppointmentAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let back = "/schedule";
  try {
    const before = await getAppointment(ctx, id);
    if (before.projectId) back = `/projects/${before.projectId}`;
    await deleteAppointment(ctx, id);
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(back);
}
