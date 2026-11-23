import { describe, expect, it } from "vitest";

import { estimateRoomAreas, formatArea, formatLength, parseLength } from "@/lib/units";

const inches = (n: number) => Math.round(n * 25.4);

describe("parseLength", () => {
  it.each([
    [`12' 4"`, inches(148)],
    [`12'4"`, inches(148)],
    [`12' 4 1/2"`, inches(148.5)],
    [`12′ 4½″`, inches(148.5)],
    [`12ft 4.5in`, inches(148.5)],
    [`12 ft 4 in`, inches(148)],
    [`148"`, inches(148)],
    [`148 in`, inches(148)],
    [`1/2"`, inches(0.5)],
    [`12'`, inches(144)],
    [`12.5 ft`, inches(150)],
    [`12`, inches(144)],
    [`12 1/2`, inches(150)],
  ])("reads %s as feet and inches", (text, mm) => {
    expect(parseLength(text, "imperial")).toEqual({ mm, unit: "imperial" });
  });

  it.each([
    ["3.76 m", 3760],
    ["3,76 m", 3760],
    ["376 cm", 3760],
    ["3760 mm", 3760],
    ["3760mm", 3760],
  ])("reads %s as metric", (text, mm) => {
    expect(parseLength(text, "imperial")).toEqual({ mm, unit: "metric" });
  });

  it("reads a bare number in the household's own unit", () => {
    expect(parseLength("3.5", "metric")).toEqual({ mm: 3500, unit: "metric" });
    expect(parseLength("3.5", "imperial")).toEqual({ mm: inches(42), unit: "imperial" });
  });

  it.each(["", "abc", "0", "-3 ft", "12 yards", "5 km", '1/0"', "999999 ft", `12-4"`])(
    "refuses %j",
    (text) => {
      expect(parseLength(text, "imperial")).toBeNull();
    },
  );
});

describe("formatLength", () => {
  it("shows feet, inches and eighths like a drawing", () => {
    expect(formatLength(inches(148.5), "imperial")).toBe("12′ 4½″");
    expect(formatLength(inches(144), "imperial")).toBe("12′");
    expect(formatLength(inches(36.125), "imperial")).toBe("3′ 0⅛″");
    expect(formatLength(inches(7.75), "imperial")).toBe("7¾″");
  });

  it("rounds up into the next foot when the inches reach 12", () => {
    expect(formatLength(inches(143.99), "imperial")).toBe("12′");
  });

  it("shows metric in metres, or millimetres when small", () => {
    expect(formatLength(3760, "metric")).toBe("3.76 m");
    expect(formatLength(3000, "metric")).toBe("3 m");
    expect(formatLength(850, "metric")).toBe("850 mm");
  });

  it("gives back what was typed after storing whole millimetres", () => {
    for (const typed of [`12' 4 1/2"`, `9' 11 7/8"`, `0' 5/8"`, `30' 0 3/8"`]) {
      const parsed = parseLength(typed, "imperial");
      if (!parsed) throw new Error(`couldn't parse ${typed}`);
      const again = parseLength(formatLength(parsed.mm, "imperial"), "imperial");
      expect(again?.mm).toBe(parsed.mm);
    }
  });
});

describe("estimateRoomAreas", () => {
  const room = { lengthMm: inches(144), widthMm: inches(120), ceilingHeightMm: inches(96) };

  it("works out floor and wall area for a rectangular room", () => {
    const { floorMm2, wallMm2 } = estimateRoomAreas(room);
    expect(formatArea(floorMm2 ?? 0, "imperial")).toBe("120 sq ft"); // 12 × 10
    expect(formatArea(wallMm2 ?? 0, "imperial")).toBe("352 sq ft"); // 44 ft × 8 ft
  });

  it("takes windows and doors off the wall area", () => {
    const door = { widthMm: inches(36), heightMm: inches(80) }; // 20 sq ft
    const { wallMm2 } = estimateRoomAreas(room, [door]);
    expect(formatArea(wallMm2 ?? 0, "imperial")).toBe("332 sq ft");
  });

  it("gives nothing it can't work out", () => {
    expect(estimateRoomAreas({ lengthMm: 3000, widthMm: null, ceilingHeightMm: 2400 })).toEqual({
      floorMm2: null,
      wallMm2: null,
    });
    expect(estimateRoomAreas({ ...room, ceilingHeightMm: null }).wallMm2).toBeNull();
  });

  it("shows metric areas in square metres", () => {
    expect(formatArea(4_000_000 * 3, "metric")).toBe("12 m²");
  });
});
