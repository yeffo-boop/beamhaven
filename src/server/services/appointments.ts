import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import {
  type AppointmentRecord,
  deleteAppointmentRow,
  insertAppointment,
  listAppointments,
  updateAppointmentRow,
} from "@/server/data/appointments";
import {
  type CalendarEntry,
  type CalendarRange,
  listCalendarEntries,
} from "@/server/data/calendar";
import type { WorkspaceContext } from "@/server/data/context";

import { appointmentInput } from "./appointment-inputs";
import { NotFoundError } from "./errors";
import type { FormInput } from "./inputs";

/** Appointments and inspections on the calendar (Milestone 7, part 2, ADR-032). */

export type AppointmentInput = FormInput<typeof appointmentInput>;

export async function getAppointments(
  ctx: WorkspaceContext,
  where: {
    projectId?: string;
    roomId?: string;
    contractorId?: string;
    from?: Date;
    to?: Date;
  } = {},
): Promise<AppointmentRecord[]> {
  assertCan(ctx, "records:view");
  return listAppointments(ctx, where);
}

export async function getAppointment(
  ctx: WorkspaceContext,
  id: string,
): Promise<AppointmentRecord> {
  assertCan(ctx, "records:view");
  const [found] = await listAppointments(ctx, { id });
  if (!found) throw new NotFoundError("appointment");
  return found;
}

export async function createAppointment(
  ctx: WorkspaceContext,
  input: AppointmentInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = appointmentInput.parse(input);
  const saved = await insertAppointment(ctx, fields);
  if (!saved) throw new NotFoundError("project, room or contractor");
  await recordActivity(ctx, {
    action: "appointment.created",
    entityType: "appointment",
    entityId: saved.id,
    summary: `Added “${fields.title}” to the calendar`,
  });
  return saved;
}

export async function updateAppointment(
  ctx: WorkspaceContext,
  id: string,
  input: AppointmentInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const fields = appointmentInput.parse(input);
  if (!(await updateAppointmentRow(ctx, id, fields))) {
    throw new NotFoundError("appointment");
  }
}

export async function deleteAppointment(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await getAppointment(ctx, id);
  if (!(await deleteAppointmentRow(ctx, id))) throw new NotFoundError("appointment");
  await recordActivity(ctx, {
    action: "appointment.deleted",
    entityType: "appointment",
    entityId: id,
    summary: `Removed “${before.title}” from the calendar`,
  });
}

export async function getCalendar(
  ctx: WorkspaceContext,
  range: CalendarRange,
): Promise<CalendarEntry[]> {
  assertCan(ctx, "records:view");
  return listCalendarEntries(ctx, range);
}
