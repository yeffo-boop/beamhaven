import { z } from "zod";

import { type MeasurementSystem, parseLength } from "@/lib/units";

/**
 * Shared rules for form input. Forms send text, so empty fields arrive as
 * "" and are stored as null.
 */

export const PROJECT_STATUSES = [
  "idea",
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "canceled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: "Idea",
  planning: "Planning",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Done",
  canceled: "Canceled",
};

export const ROOM_TYPES = [
  "bedroom",
  "bathroom",
  "kitchen",
  "living",
  "dining",
  "office",
  "laundry",
  "garage",
  "basement",
  "attic",
  "hallway",
  "exterior",
  "whole_house",
  "other",
] as const;

export const OPENING_KINDS = ["window", "door", "other"] as const;

/** Optional text: trimmed, "" becomes null. */
export function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);
}

export function requiredText(max: number, emptyMessage: string, label: string) {
  return z.string().trim().min(1, emptyMessage).max(max, `${label} is too long`);
}

/** "2026-12-01" from a date field, or "" for none. */
export const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((value, context) => {
    if (value === "") return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return date;
  });

export const requiredDate = optionalDate.refine((value) => value !== null, "Enter a date");

/** A typed length such as 12' 4" or 3.76 m, as whole millimetres; "" for none. */
export function optionalLength(system: MeasurementSystem) {
  return z
    .string()
    .trim()
    .default("")
    .transform((value, context) => {
      if (value === "") return null;
      const parsed = parseLength(value, system);
      if (!parsed) {
        context.addIssue({
          code: "custom",
          message:
            system === "metric"
              ? "Enter a length like 3.76 m or 376 cm"
              : `Enter a length like 12' 4" or 12' 4 1/2"`,
        });
        return z.NEVER;
      }
      return parsed;
    });
}

export function requiredLength(system: MeasurementSystem) {
  return optionalLength(system).refine((value) => value !== null, "Enter a size");
}

export const propertyInput = z.object({
  name: requiredText(100, "Give the property a name, like “Our house”", "The name"),
  addressLine1: optionalText(200, "The address"),
  addressLine2: optionalText(200, "The address"),
  city: optionalText(100, "The city"),
  region: optionalText(100, "The state"),
  postalCode: optionalText(20, "The ZIP code"),
  country: optionalText(100, "The country"),
  notes: optionalText(5000, "The notes"),
});

export const projectInput = z
  .object({
    propertyId: z.string().trim().min(1, "Choose a property"),
    name: requiredText(150, "Give the project a name", "The name"),
    description: optionalText(5000, "The description"),
    status: z.enum(PROJECT_STATUSES, { message: "Choose a status" }),
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    actualStart: optionalDate,
    actualEnd: optionalDate,
  })
  .refine((p) => !p.plannedStart || !p.plannedEnd || p.plannedStart <= p.plannedEnd, {
    message: "The planned end is before the start",
    path: ["plannedEnd"],
  })
  .refine((p) => !p.actualStart || !p.actualEnd || p.actualStart <= p.actualEnd, {
    message: "The actual end is before the start",
    path: ["actualEnd"],
  });

export function roomInput(system: MeasurementSystem) {
  return z.object({
    propertyId: z.string().trim().min(1, "Choose a property"),
    name: requiredText(100, "Give the room a name", "The name"),
    type: z.enum(ROOM_TYPES, { message: "Choose a type" }),
    floorLevel: optionalText(50, "The floor"),
    length: optionalLength(system),
    width: optionalLength(system),
    ceilingHeight: optionalLength(system),
    description: optionalText(5000, "The description"),
    notes: optionalText(5000, "The notes"),
  });
}

export function openingInput(system: MeasurementSystem) {
  return z.object({
    kind: z.enum(OPENING_KINDS, { message: "Choose window, door or other" }),
    label: optionalText(100, "The label"),
    width: requiredLength(system),
    height: requiredLength(system),
    sillHeight: optionalLength(system),
    notes: optionalText(1000, "The notes"),
  });
}

export const projectRoomsInput = z
  .array(
    z.object({
      roomId: z.string().trim().min(1),
      plannedImprovements: optionalText(2000, "The planned work"),
    }),
  )
  .max(200);

/**
 * What a service accepts from a form: any text for each field. The service
 * then validates it with the matching schema, so nothing unchecked gets in.
 */
export type FormInput<S extends z.ZodType> = { [K in keyof z.input<S>]?: string | null };
