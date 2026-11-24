/**
 * The background worker (Milestone 7, part 3, ADR-009 and ADR-033).
 *
 *   npm run worker
 *
 * It runs all the time next to the website, in its own container
 * (`worker` in docker-compose.yml). pg-boss keeps its job queue in our
 * PostgreSQL database, in its own "pgboss" schema, so there's no other
 * server to run or back up. Every 15 minutes it adds the reminders that are
 * due. Stop it with Ctrl+C (or `docker compose stop worker`).
 */
import { loadEnvConfig } from "@next/env";
import { PgBoss } from "pg-boss";

loadEnvConfig(process.cwd());

const QUEUE = "reminders";
const EVERY_15_MINUTES = "*/15 * * * *";

async function main() {
  // Imported after .env is loaded, because they read settings when used.
  const { getEnv } = await import("@/config/env");
  const { createDueReminders } = await import("@/server/services/reminders");

  const boss = new PgBoss({ connectionString: getEnv().DATABASE_URL, schema: "pgboss" });
  boss.on("error", (error) => console.error("[worker]", error));
  await boss.start();
  await boss.createQueue(QUEUE);
  // pg-boss makes sure only one job runs per tick, even if two workers start.
  await boss.schedule(QUEUE, EVERY_15_MINUTES);
  await boss.work(QUEUE, async () => {
    const created = await createDueReminders();
    console.log(`[worker] ${new Date().toISOString()} added ${created} reminder(s)`);
  });
  // And once at start, so a restart doesn't wait for the next quarter hour.
  await boss.send(QUEUE, {});
  console.log("[worker] started: reminders every 15 minutes");

  const stop = async () => {
    console.log("[worker] stopping");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((error: unknown) => {
  console.error("[worker] could not start:", error);
  process.exit(1);
});
