import { z } from "zod";

import { optionalText, requiredDate, requiredText } from "./inputs";

/** Form rules for appointments (Milestone 7, part 2). */

export const APPOINTMENT_KINDS = ["appointment", "inspection", "delivery", "other"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  appointment: "Appointment",
  inspection: "Inspection",
  delivery: "Delivery",
  other: "Other",
};

export const OUTCOMES = ["passed", "failed"] as const;
export const OUTCOME_LABELS: Record<(typeof OUTCOMES)[number], string> = {
  passed: "Passed",
  failed: "Failed",
};

/** "9:30", "09:30" or "" from a time input, as "09:30" or null. */
const optionalTime = z
  .string()
  .trim()
  .default("")
  .transform((value, context) => {
    if (value === "") return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    const h = Number(match?.[1]);
    const m = Number(match?.[2]);
    if (!match || h > 23 || m > 59) {
      context.addIssue({ code: "custom", message: "Enter a time like 9:30" });
      return z.NEVER;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });

export const appointmentInput = z
  .object({
    title: requiredText(200, "Say what it is", "The title"),
    kind: z.enum(APPOINTMENT_KINDS, { message: "Choose a kind" }).default("appointment"),
    day: requiredDate,
    startTime: optionalTime,
    endTime: optionalTime,
    location: optionalText(300, "The place"),
    projectId: optionalText(64, "The project"),
    roomId: optionalText(64, "The room"),
    contractorId: optionalText(64, "The contractor"),
    outcome: z
      .string()
      .trim()
      .default("")
      .pipe(z.union([z.literal("").transform(() => null), z.enum(OUTCOMES)])),
    notes: optionalText(5000, "The notes"),
  })
  .refine((a) => !a.endTime || a.startTime, {
    message: "Add a start time too",
    path: ["startTime"],
  })
  .refine((a) => !a.endTime || !a.startTime || a.endTime > a.startTime, {
    message: "The end is before the start",
    path: ["endTime"],
  })
  // Only an inspection passes or fails; anything else drops the result.
  .transform((a) => ({ ...a, outcome: a.kind === "inspection" ? a.outcome : null }));
