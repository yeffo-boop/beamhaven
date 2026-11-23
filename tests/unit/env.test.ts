import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";

const DATABASE_URL = "postgresql://beamhaven:pw@localhost:5432/beamhaven";
const BETTER_AUTH_SECRET = "a-test-secret-that-is-at-least-32-characters";

describe("parseEnv", () => {
  it("reads APP_URL and strips a trailing slash", () => {
    const env = parseEnv({ APP_URL: "http://localhost:3000/", DATABASE_URL, BETTER_AUTH_SECRET });
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.APP_NAME).toBe("BeamHaven");
  });

  it("fails clearly when APP_URL is missing or not a URL", () => {
    expect(() => parseEnv({ DATABASE_URL, BETTER_AUTH_SECRET })).toThrow(/APP_URL/);
    expect(() =>
      parseEnv({ APP_URL: "beamhaven.thehoschak.com", DATABASE_URL, BETTER_AUTH_SECRET }),
    ).toThrow(/APP_URL/);
  });

  it("requires https in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        APP_URL: "http://example.com",
        DATABASE_URL,
        BETTER_AUTH_SECRET,
      }),
    ).toThrow(/https/);
    expect(
      parseEnv({
        NODE_ENV: "production",
        APP_URL: "https://example.com",
        TRUST_PROXY: "true",
        DATABASE_URL,
        BETTER_AUTH_SECRET,
      }).TRUST_PROXY,
    ).toBe(true);
  });

  it("requires a PostgreSQL DATABASE_URL", () => {
    expect(() => parseEnv({ APP_URL: "http://localhost:3000", BETTER_AUTH_SECRET })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      parseEnv({
        APP_URL: "http://localhost:3000",
        DATABASE_URL: "mysql://x@y/z",
        BETTER_AUTH_SECRET,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("allows http in production only for this computer's own address", () => {
    const base = { NODE_ENV: "production", DATABASE_URL, BETTER_AUTH_SECRET };
    expect(parseEnv({ ...base, APP_URL: "http://localhost:3100" }).APP_URL).toBe(
      "http://localhost:3100",
    );
    expect(() => parseEnv({ ...base, APP_URL: "http://192.168.1.20" })).toThrow(/https/);
  });

  it("requires a real BETTER_AUTH_SECRET and reads the session length", () => {
    const base = { APP_URL: "http://localhost:3000", DATABASE_URL };
    expect(() => parseEnv(base)).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/32 characters/);
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_SECRET: "CHANGE_ME_TO_A_LONG_RANDOM_STRING_PLEASE" }),
    ).toThrow(/example/);
    expect(parseEnv({ ...base, BETTER_AUTH_SECRET }).SESSION_MAX_AGE_DAYS).toBe(30);
    expect(
      parseEnv({ ...base, BETTER_AUTH_SECRET, SESSION_MAX_AGE_DAYS: "7" }).SESSION_MAX_AGE_DAYS,
    ).toBe(7);
  });
});
