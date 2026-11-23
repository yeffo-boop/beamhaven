// Runs before each integration test file. Loads .env the same way Next.js
// does, then points the tests at the separate test database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { testDatabaseUrl } from "./test-database";

loadEnvConfig(process.cwd());

process.env["DATABASE_URL"] = testDatabaseUrl(process.env["DATABASE_URL"]);
// A fixed secret is fine here: it only signs sessions inside the test database.
process.env["BETTER_AUTH_SECRET"] ??= "integration-tests-only-secret-0123456789";
// Uploaded files go to a fresh temporary folder, never the real uploads folder.
process.env["STORAGE_LOCAL_PATH"] = mkdtempSync(path.join(tmpdir(), "beamhaven-uploads-"));
