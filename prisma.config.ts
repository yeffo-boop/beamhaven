// Prisma CLI configuration (Prisma 7).
// Prisma no longer reads .env by itself, so we load it the same way Next.js does.
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Left undefined when not set, so `prisma generate` still works in CI.
    url: process.env["DATABASE_URL"],
  },
});
