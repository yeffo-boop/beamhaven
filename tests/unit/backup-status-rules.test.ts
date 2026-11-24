import { describe, expect, it } from "vitest";

import { backupHealth } from "@/server/services/backup-status-rules";

const now = new Date("2026-11-24T12:00:00Z");
const status = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    finishedAt: "2026-11-24T10:00:02Z",
    ok: true,
    lastSuccessAt: "2026-11-24T10:00:02Z",
    offsite: "ok",
    message: "",
    ...over,
  });

describe("backup health", () => {
  it("is fine after a recent good backup, with or without an off-site copy", () => {
    expect(backupHealth(status(), now)).toMatchObject({ state: "ok", offsite: "ok" });
    expect(backupHealth(status({ offsite: "skipped" }), now)).toMatchObject({
      state: "ok",
      offsite: "skipped",
    });
  });

  it("is late once the last good backup is more than two days old", () => {
    const old = "2026-11-22T11:00:00Z";
    expect(backupHealth(status({ lastSuccessAt: old }), now)).toMatchObject({ state: "late" });
    expect(backupHealth(status({ lastSuccessAt: "2026-11-22T13:00:00Z" }), now).state).toBe("ok");
  });

  it("reports a failed run, keeping when the last good one was", () => {
    expect(
      backupHealth(
        status({ ok: false, lastSuccessAt: "2026-11-23T02:00:00Z", message: "Stopped at line 9." }),
        now,
      ),
    ).toEqual({
      state: "failing",
      lastSuccessAt: new Date("2026-11-23T02:00:00Z"),
      message: "Stopped at line 9.",
    });
    expect(backupHealth(status({ offsite: "failed" }), now).state).toBe("offsite_failed");
  });

  it("treats no file as never backed up, and a broken file as failing", () => {
    expect(backupHealth(null, now)).toEqual({ state: "never" });
    expect(backupHealth("not json", now).state).toBe("failing");
    expect(backupHealth(JSON.stringify({ ok: "yes" }), now).state).toBe("failing");
  });
});
