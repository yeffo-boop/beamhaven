import "server-only";

import { z } from "zod";

/**
 * Server-side configuration, read from environment variables and checked
 * with Zod so a typo fails loudly instead of causing odd behaviour later.
 *
 * Important (ADR-011): none of these use the NEXT_PUBLIC_ prefix, so Next.js
 * never copies them into browser JavaScript. They are read when the server
 * handles a request, which means changing APP_URL only needs a restart.
 * In Next.js 16, code that reads these during rendering must run at request
 * time (for example after `await connection()`), not during prerendering.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z
    .url({ protocol: /^https?$/, message: "APP_URL must be a full http(s) URL" })
    .transform((value) => value.replace(/\/+$/, "")),
  APP_NAME: z.string().min(1).default("BeamHaven"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgresql://"),
  // Signs session cookies and tokens. Changing it signs everyone out.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (use: openssl rand -base64 32)")
    .refine((value) => !value.startsWith("CHANGE_ME"), "BETTER_AUTH_SECRET is still the example"),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

/** Parses a raw environment object. Exported separately so tests can use it. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !isHttpsOrLoopback(env.APP_URL)) {
    throw new Error(
      "Invalid environment configuration:\n  - APP_URL: must use https:// in production",
    );
  }
  return env;
}

/**
 * Production needs https so login cookies are only ever sent encrypted.
 * The one exception is this computer's own address (localhost), which the
 * end-to-end tests use; it can never be reached from another machine.
 */
function isHttpsOrLoopback(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

let cached: Env | undefined;

/** The validated environment for the running server. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
