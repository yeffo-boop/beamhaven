import { PHOTO_PHASE_LABELS, PHOTO_PHASES } from "@/server/services/photo-inputs";

export const PHASE_OPTIONS = [
  { value: "", label: "Not sorted" },
  ...PHOTO_PHASES.map((p) => ({ value: p, label: PHOTO_PHASE_LABELS[p] })),
];
