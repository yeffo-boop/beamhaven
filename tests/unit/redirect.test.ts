import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/redirect";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/projects")).toBe("/projects");
    expect(safeNextPath("/budget?view=lines")).toBe("/budget?view=lines");
  });

  it("falls back to the home page for anything else", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("projects")).toBe("/");
  });
});
