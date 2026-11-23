/**
 * Integration tests delete and recreate rows, so they must never run against
 * the database you use with `npm run dev`. They use a separate database on
 * the same server, named after yours with "_test" added (beamhaven ->
 * beamhaven_test). If DATABASE_URL already ends in "_test" (as in CI), it is
 * used as it is.
 */
export function testDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env first (see README).");
  }
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Unexpected database name in DATABASE_URL: "${name}"`);
  }
  if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  return url.toString();
}

export function databaseName(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, "");
}
