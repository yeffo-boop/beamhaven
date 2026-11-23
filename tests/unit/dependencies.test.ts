import { describe, expect, it } from "vitest";

import { waitsOnEventually } from "@/lib/dependencies";

// cabinets → drywall → electrical, and paint → drywall.
const edges = [
  { taskId: "cabinets", dependsOnId: "drywall" },
  { taskId: "drywall", dependsOnId: "electrical" },
  { taskId: "paint", dependsOnId: "drywall" },
];

describe("task dependencies", () => {
  it("follows waits through other tasks", () => {
    expect(waitsOnEventually(edges, "cabinets", "electrical")).toBe(true);
    expect(waitsOnEventually(edges, "paint", "electrical")).toBe(true);
  });

  it("doesn't go backwards or sideways", () => {
    expect(waitsOnEventually(edges, "electrical", "cabinets")).toBe(false);
    expect(waitsOnEventually(edges, "paint", "cabinets")).toBe(false);
  });

  it("counts a task as reaching itself", () => {
    expect(waitsOnEventually(edges, "paint", "paint")).toBe(true);
  });

  it("stops on loops already there instead of running forever", () => {
    const loop = [
      { taskId: "a", dependsOnId: "b" },
      { taskId: "b", dependsOnId: "a" },
    ];
    expect(waitsOnEventually(loop, "a", "c")).toBe(false);
  });
});
