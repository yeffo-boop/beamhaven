import {
  CHANNEL_LABELS,
  CHANNELS,
  CONTRACTOR_STATUS_LABELS,
  CONTRACTOR_STATUSES,
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/server/services/contractor-inputs";

/** Choice lists for the contractor, log, warranty and task forms. */

export const contractorStatusOptions = CONTRACTOR_STATUSES.map((value) => ({
  value,
  label: CONTRACTOR_STATUS_LABELS[value],
}));

export const channelOptions = CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] }));

export const taskStatusOptions = TASK_STATUSES.map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

export const priorityOptions = TASK_PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

export function labelFor<T extends string>(labels: Record<T, string>, value: string): string {
  return labels[value as T] ?? value;
}
