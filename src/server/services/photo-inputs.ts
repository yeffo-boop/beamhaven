import { z } from "zod";

import { optionalDate, optionalText } from "./inputs";

/** Progress photo phases (Milestone 8, part 3, ADR-036). */
export const PHOTO_PHASES = ["before", "during", "after"] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  before: "Before",
  during: "During",
  after: "After",
};

/** "" means not sorted yet. */
export const optionalPhase = z
  .enum(["", ...PHOTO_PHASES], { message: "Choose before, during or after" })
  .default("")
  .transform((value) => (value === "" ? null : value));

export const photoPhaseInput = z.object({ phase: optionalPhase, takenOn: optionalDate });

export const photoDetailsInput = photoPhaseInput.extend({
  caption: optionalText(300, "The caption"),
});
