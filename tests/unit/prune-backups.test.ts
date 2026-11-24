import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/server/prune-backups.sh");
let dir = "";

/** Makes a backup pair for each day, at 2 AM. */
function backups(days: string[]) {
  dir = mkdtempSync(join(tmpdir(), "beamhaven-backups-"));
  for (const day of days) {
    writeFileSync(join(dir, `beamhaven-db-${day}_020000.dump`), "x");
    writeFileSync(join(dir, `beamhaven-uploads-${day}_020000.tar.gz`), "x");
  }
}

function prune(...args: string[]) {
  return execFileSync("bash", [script, ...args], {
    env: { ...process.env, BACKUP_DIR: dir },
    encoding: "utf8",
  });
}

const kept = () =>
  readdirSync(dir)
    .filter((f) => f.startsWith("beamhaven-db-"))
    .map((f) => f.slice("beamhaven-db-".length, "beamhaven-db-".length + 10))
    .sort();

/** Every day from start, for n days. */
function everyDay(start: string, n: number): string[] {
  const first = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(first + i * 86_400_000).toISOString().slice(0, 10),
  );
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// The script runs on the Ubuntu VM (bash 5, GNU date). macOS has an older bash
// and a different date command, so on a Mac these run in CI only.
describe.skipIf(process.platform !== "linux")("prune-backups.sh", () => {
  it("keeps 7 daily, 4 weekly and 12 monthly backups from a year and a half of nightly ones", () => {
    backups(everyDay("2025-06-01", 540));
    prune();
    const days = kept();
    // The last day is 2026-11-22 (a Sunday).
    expect(days.slice(-7)).toEqual(everyDay("2026-11-16", 7));
    // Plus the newest of the 3 weeks before this one (Nov 1, 8 and 15, all Sundays),
    // and of each of the 11 months before this one, back to December 2025.
    expect(days).toEqual(
      [
        "2025-12-31",
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
        "2026-05-31",
        "2026-06-30",
        "2026-07-31",
        "2026-08-31",
        "2026-09-30",
        "2026-10-31",
        "2026-11-01",
        "2026-11-08",
        "2026-11-15",
        ...everyDay("2026-11-16", 7),
      ].sort(),
    );
    // Each kept backup still has both its files.
    expect(readdirSync(dir)).toHaveLength(days.length * 2);
  });

  it("deletes nothing when there are only a few, and a dry run changes nothing", () => {
    backups(["2026-11-20", "2026-11-21"]);
    prune();
    expect(kept()).toEqual(["2026-11-20", "2026-11-21"]);

    rmSync(dir, { recursive: true, force: true });
    backups(everyDay("2026-01-01", 60));
    const out = prune("--dry-run");
    expect(out).toContain("would delete");
    expect(kept()).toHaveLength(60);
  });

  it("keeps only the newest of several backups on one day", () => {
    backups([]);
    for (const time of ["020000", "131500", "180000"]) {
      writeFileSync(join(dir, `beamhaven-db-2026-11-22_${time}.dump`), "x");
    }
    prune();
    expect(readdirSync(dir)).toEqual(["beamhaven-db-2026-11-22_180000.dump"]);
  });
});
