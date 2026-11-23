import { z } from "zod";

import { optionalDate, optionalText, requiredDate, requiredText } from "./inputs";

/** Form rules for contractors, the communication log, warranties and tasks. */

export const CONTRACTOR_STATUSES = ["prospect", "active", "past", "do_not_use"] as const;
export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number];
export const CONTRACTOR_STATUS_LABELS: Record<ContractorStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  past: "Worked with before",
  do_not_use: "Do not use",
};

export const CHANNELS = ["call", "email", "text", "meeting", "note"] as const;
export const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  call: "Call",
  email: "Email",
  text: "Text",
  meeting: "Meeting",
  note: "Note",
};

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const PRIORITY_LABELS: Record<(typeof TASK_PRIORITIES)[number], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

const optionalEmail = z
  .string()
  .trim()
  .max(200, "The email is too long")
  .default("")
  .refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Enter an email like name@example.com",
  )
  .transform((v) => (v === "" ? null : v.toLowerCase()));

/** A web address; "example.com" gets https:// added. Only http(s) is allowed. */
const optionalWebsite = z
  .string()
  .trim()
  .max(300, "The website is too long")
  .default("")
  .transform((value, context) => {
    if (value === "") return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Falls through to the message below.
    }
    context.addIssue({ code: "custom", message: "Enter a web address like example.com" });
    return z.NEVER;
  });

export const contractorInput = z.object({
  name: requiredText(150, "Enter the company or person’s name", "The name"),
  contactName: optionalText(150, "The contact name"),
  trade: optionalText(100, "The trade"),
  phone: optionalText(50, "The phone number"),
  email: optionalEmail,
  website: optionalWebsite,
  address: optionalText(500, "The address"),
  licenseNumber: optionalText(100, "The license number"),
  licenseState: optionalText(100, "The state"),
  licenseExpiresOn: optionalDate,
  insuranceProvider: optionalText(150, "The insurer"),
  insuranceExpiresOn: optionalDate,
  status: z.enum(CONTRACTOR_STATUSES, { message: "Choose a status" }),
  notes: optionalText(5000, "The notes"),
});

export const contractorProjectInput = z.object({
  projectId: z.string().trim().min(1, "Choose a project"),
  role: optionalText(150, "The role"),
});

export const communicationInput = z.object({
  channel: z.enum(CHANNELS, { message: "Choose how you were in touch" }),
  occurredOn: requiredDate,
  projectId: optionalText(64, "The project"),
  summary: requiredText(5000, "Write what was said or agreed", "The summary"),
});

export const warrantyInput = z
  .object({
    coverage: requiredText(300, "Say what the warranty covers", "The coverage"),
    provider: optionalText(150, "The provider"),
    contractorId: optionalText(64, "The contractor"),
    projectId: optionalText(64, "The project"),
    roomId: optionalText(64, "The room"),
    startsOn: optionalDate,
    expiresOn: optionalDate,
    notes: optionalText(5000, "The notes"),
  })
  .refine((w) => !w.startsOn || !w.expiresOn || w.startsOn <= w.expiresOn, {
    message: "It ends before it starts",
    path: ["expiresOn"],
  })
  .refine((w) => w.contractorId || w.projectId || w.roomId, {
    message: "Choose a contractor, project or room",
    path: ["projectId"],
  });

/**
 * The assignee arrives as one choice: "user:<id>", "contractor:<id>" or ""
 * for nobody, so one person or company is assigned at most.
 */
const assignee = z
  .string()
  .trim()
  .max(80)
  .default("")
  .transform((value, context) => {
    if (value === "") return { userId: null, contractorId: null };
    const match = /^(user|contractor):(.+)$/.exec(value);
    if (!match) {
      context.addIssue({ code: "custom", message: "Choose who it's assigned to" });
      return z.NEVER;
    }
    return match[1] === "user"
      ? { userId: match[2]!, contractorId: null }
      : { userId: null, contractorId: match[2]! };
  });

function blankAsMissing<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

export const taskInput = z
  .object({
    title: requiredText(200, "Say what needs doing", "The task"),
    description: optionalText(5000, "The details"),
    projectId: optionalText(64, "The project"),
    roomId: optionalText(64, "The room"),
    // A new task's form has no status field, so "" means "not given".
    status: blankAsMissing(z.enum(TASK_STATUSES, { message: "Choose a status" }).default("todo")),
    priority: blankAsMissing(
      z.enum(TASK_PRIORITIES, { message: "Choose a priority" }).default("normal"),
    ),
    assignee,
    dueDate: optionalDate,
  })
  .refine((t) => t.projectId || t.roomId, {
    message: "A task belongs to a project or a room",
    path: ["title"],
  });

export const taskStatusInput = z.enum(TASK_STATUSES, { message: "Choose a status" });

/** Days from `today` until `date` (negative once it has passed). */
export function daysUntil(date: Date, today: Date): number {
  const day = 24 * 60 * 60 * 1000;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((date.getTime() - start) / day);
}

export type ExpiryState = "expired" | "soon" | "ok";

/** "soon" means within 30 days, the warning window for licenses, insurance and warranties. */
export function expiryState(date: Date | null, today: Date): ExpiryState | null {
  if (!date) return null;
  const days = daysUntil(date, today);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}
