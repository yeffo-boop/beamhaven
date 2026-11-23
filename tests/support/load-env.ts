// Loads .env (and .env.test, if present) the same way Next.js does, so
// integration tests use the same DATABASE_URL as `npm run dev`.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
