import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";
import { getAuthDatabase } from "@/server/data/auth-database";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const DAY_IN_SECONDS = 60 * 60 * 24;

/**
 * Better Auth configuration (ADR-004).
 *
 * Built on first use rather than when the file loads, because it reads
 * settings (APP_URL, the secret) that only exist when the server is running,
 * not while `next build` runs.
 */
function createAuth() {
  const env = getEnv();
  return betterAuth({
    appName: brand.name,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: getAuthDatabase(),
    emailAndPassword: {
      enabled: true,
      // No public sign-up. The first account comes from the setup command
      // (scripts/create-first-account.ts); everyone else joins by invitation.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // Sliding expiry: each visit (at most once a day) pushes the end date
      // out again, so you're only asked to sign in after a month away.
      expiresIn: env.SESSION_MAX_AGE_DAYS * DAY_IN_SECONDS,
      updateAge: DAY_IN_SECONDS,
    },
    advanced: {
      ipAddress: {
        // The client IP is used for rate limiting. Only trust a header that
        // our own reverse proxy sets: Nginx Proxy Manager replaces X-Real-IP
        // with the real address, so a visitor can't fake it. Without a
        // proxy, there is no trustworthy header to read.
        ipAddressHeaders: env.TRUST_PROXY ? ["x-real-ip"] : [],
      },
    },
    telemetry: { enabled: false },
    // nextCookies lets Server Actions set and clear the login cookie.
    // It must stay last in this list.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
