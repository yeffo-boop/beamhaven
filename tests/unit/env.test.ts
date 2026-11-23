import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";

describe("parseEnv", () => {
  it("reads APP_URL and strips a trailing slash", () => {
    const env = parseEnv({ APP_URL: "http://localhost:3000/" });
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.APP_NAME).toBe("BeamHaven");
  });

  it("fails clearly when APP_URL is missing or not a URL", () => {
    expect(() => parseEnv({})).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: "beamhaven.thehoschak.com" })).toThrow(/APP_URL/);
  });

  it("requires https in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production", APP_URL: "http://example.com" })).toThrow(
      /https/,
    );
    expect(
      parseEnv({ NODE_ENV: "production", APP_URL: "https://example.com", TRUST_PROXY: "true" })
        .TRUST_PROXY,
    ).toBe(true);
  });
});
