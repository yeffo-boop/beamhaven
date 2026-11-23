import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";

const DATABASE_URL = "postgresql://beamhaven:pw@localhost:5432/beamhaven";

describe("parseEnv", () => {
  it("reads APP_URL and strips a trailing slash", () => {
    const env = parseEnv({ APP_URL: "http://localhost:3000/", DATABASE_URL });
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.APP_NAME).toBe("BeamHaven");
  });

  it("fails clearly when APP_URL is missing or not a URL", () => {
    expect(() => parseEnv({ DATABASE_URL })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: "beamhaven.thehoschak.com", DATABASE_URL })).toThrow(
      /APP_URL/,
    );
  });

  it("requires https in production", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "production", APP_URL: "http://example.com", DATABASE_URL }),
    ).toThrow(/https/);
    expect(
      parseEnv({
        NODE_ENV: "production",
        APP_URL: "https://example.com",
        TRUST_PROXY: "true",
        DATABASE_URL,
      }).TRUST_PROXY,
    ).toBe(true);
  });

  it("requires a PostgreSQL DATABASE_URL", () => {
    expect(() => parseEnv({ APP_URL: "http://localhost:3000" })).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnv({ APP_URL: "http://localhost:3000", DATABASE_URL: "mysql://x@y/z" }),
    ).toThrow(/DATABASE_URL/);
  });
});
