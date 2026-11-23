import { cn } from "@/lib/utils";
import { PROJECT_STATUSES, type ProjectStatus, STATUS_LABELS } from "@/server/services/inputs";

// Color is never the only signal: every badge also has its text label.
const tones: Record<ProjectStatus, string> = {
  idea: "bg-muted text-muted-foreground",
  planning: "bg-info/12 text-info",
  in_progress: "bg-primary/12 text-primary",
  on_hold: "bg-warning/15 text-warning",
  completed: "bg-positive/15 text-positive",
  canceled: "bg-muted text-muted-foreground line-through",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as ProjectStatus] ?? status;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = tones[status as ProjectStatus] ?? tones.idea;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export const statusOptions = PROJECT_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));
