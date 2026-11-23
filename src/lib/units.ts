/**
 * Lengths are stored as whole millimetres (docs/DATA_MODEL.md, rule 4),
 * whatever the person typed. These helpers turn typed text into millimetres
 * and back, and work out estimated areas.
 *
 * One millimetre is about 1/25 of an inch, so storing whole millimetres and
 * showing the nearest 1/8″ gives back what was typed for everyday sizes.
 */

export type MeasurementSystem = "imperial" | "metric";

export const MM_PER_INCH = 25.4;
const MM_PER_FOOT = MM_PER_INCH * 12;

/** Longest length we accept, so typos like "1200 ft" for a room get caught. */
export const MAX_LENGTH_MM = 1_000_000; // 1 km

export type ParsedLength = { mm: number; unit: MeasurementSystem };

const FRACTION_CHARS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/** "4", "4.5", "4 1/2", "4½", "1/2", "½" → a number of inches (or feet). */
function parseNumberWithFraction(text: string): number | null {
  let value = text.trim();
  if (value === "") return null;
  let extra = 0;
  const last = value.at(-1) ?? "";
  if (last in FRACTION_CHARS) {
    extra = FRACTION_CHARS[last] ?? 0;
    value = value.slice(0, -1).trim();
    if (value === "") return extra;
  }
  const mixed = /^(?:(\d+(?:\.\d+)?)\s+)?(\d+)\/(\d+)$/.exec(value);
  if (mixed) {
    const whole = mixed[1] ? Number(mixed[1]) : 0;
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return whole + Number(mixed[2]) / denominator + extra;
  }
  if (/^\d+(?:\.\d+)?$/.test(value) || /^\.\d+$/.test(value)) return Number(value) + extra;
  return null;
}

const FEET = /(?:'|’|′|ft\.?|feet|foot)/.source;
const INCHES = /(?:"|”|″|''|in\.?|inch|inches)/.source;

/**
 * Reads a length typed by a person. Accepts, for example:
 *   12' 4"   12' 4 1/2"   12ft 4.5in   12′ 4½″   148"   12'   12.5 ft
 *   3.76 m   376 cm   3760 mm
 * A bare number means feet in the imperial system and metres in metric.
 * Returns null if the text isn't a length we understand.
 */
export function parseLength(input: string, system: MeasurementSystem): ParsedLength | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, ".");
  if (text === "") return null;

  const metric = /^(\d+(?:\.\d+)?|\.\d+) ?(mm|cm|m)$/.exec(text);
  if (metric) {
    const factor = { mm: 1, cm: 10, m: 1000 }[metric[2] as "mm" | "cm" | "m"];
    return finish(Number(metric[1]) * factor, "metric");
  }

  const imperial = new RegExp(
    `^(?:([\\d.]+) ?${FEET})?[ -]?(?:([\\d./ ¼½¾⅛⅜⅝⅞]+?) ?${INCHES})?$`,
  ).exec(text);
  if (imperial && (imperial[1] || imperial[2])) {
    const feet = imperial[1] ? parseNumberWithFraction(imperial[1]) : 0;
    const inches = imperial[2] ? parseNumberWithFraction(imperial[2]) : 0;
    if (feet === null || inches === null) return null;
    return finish(feet * MM_PER_FOOT + inches * MM_PER_INCH, "imperial");
  }

  // A bare number, in the household's usual unit.
  const bare = parseNumberWithFraction(text);
  if (bare !== null) {
    return finish(system === "metric" ? bare * 1000 : bare * MM_PER_FOOT, system);
  }
  return null;
}

function finish(mm: number, unit: MeasurementSystem): ParsedLength | null {
  const rounded = Math.round(mm);
  if (!Number.isFinite(mm) || rounded <= 0 || rounded > MAX_LENGTH_MM) return null;
  return { mm: rounded, unit };
}

const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

/**
 * Shows a length the way a drawing would: 12′ 4½″ (nearest 1/8″), or
 * 3.76 m / 376 mm in metric.
 */
export function formatLength(mm: number, system: MeasurementSystem): string {
  if (system === "metric") {
    if (mm < 1000) return `${mm} mm`;
    return `${trimZeros((mm / 1000).toFixed(3))} m`;
  }
  const totalEighths = Math.round((mm / MM_PER_INCH) * 8);
  const feet = Math.floor(totalEighths / 96);
  const remainingEighths = totalEighths - feet * 96;
  const inches = Math.floor(remainingEighths / 8);
  const fraction = EIGHTHS[remainingEighths % 8] ?? "";
  const inchText = `${inches}${fraction}″`;
  if (feet === 0) return inchText;
  if (inches === 0 && fraction === "") return `${feet}′`;
  return `${feet}′ ${inchText}`;
}

function trimZeros(text: string): string {
  return text.replace(/\.?0+$/, "");
}

const MM2_PER_SQFT = MM_PER_FOOT * MM_PER_FOOT;

/** An area in square millimetres, shown as square feet or square metres. */
export function formatArea(mm2: number, system: MeasurementSystem): string {
  if (system === "metric") return `${trimZeros((mm2 / 1_000_000).toFixed(1))} m²`;
  return `${Math.round(mm2 / MM2_PER_SQFT).toLocaleString("en-US")} sq ft`;
}

export type RoomSize = {
  lengthMm: number | null;
  widthMm: number | null;
  ceilingHeightMm: number | null;
};
export type OpeningSize = { widthMm: number; heightMm: number };

/**
 * Estimated floor and wall areas (in mm²), assuming a rectangular room.
 * Wall area is the perimeter times the ceiling height, minus the windows
 * and doors. Both are labelled as estimates wherever they're shown.
 */
export function estimateRoomAreas(
  room: RoomSize,
  openings: OpeningSize[] = [],
): { floorMm2: number | null; wallMm2: number | null } {
  const { lengthMm, widthMm, ceilingHeightMm } = room;
  if (!lengthMm || !widthMm) return { floorMm2: null, wallMm2: null };
  const floorMm2 = lengthMm * widthMm;
  if (!ceilingHeightMm) return { floorMm2, wallMm2: null };
  const gross = 2 * (lengthMm + widthMm) * ceilingHeightMm;
  const openingsMm2 = openings.reduce((sum, o) => sum + o.widthMm * o.heightMm, 0);
  return { floorMm2, wallMm2: Math.max(0, gross - openingsMm2) };
}
