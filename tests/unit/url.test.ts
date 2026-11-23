import { describe, expect, it } from "vitest";

import { absoluteUrl } from "@/lib/url";

describe("absoluteUrl", () => {
  it("joins the base URL and a path", () => {
    expect(absoluteUrl("https://beamhaven.thehoschak.com", "/invite/abc")).toBe(
      "https://beamhaven.thehoschak.com/invite/abc",
    );
  });

  it("follows a changed domain without code changes", () => {
    expect(absoluteUrl("https://app.newname.com", "/invite/abc")).toBe(
      "https://app.newname.com/invite/abc",
    );
  });

  it("keeps a base path", () => {
    expect(absoluteUrl("https://example.com/beamhaven", "/reset?t=1")).toBe(
      "https://example.com/beamhaven/reset?t=1",
    );
  });

  it("rejects paths that could point at another site", () => {
    expect(() => absoluteUrl("https://example.com", "//evil.example/x")).toThrow();
    expect(() => absoluteUrl("https://example.com", "https://evil.example/x")).toThrow();
    expect(() => absoluteUrl("https://example.com", "invite")).toThrow();
  });
});
