import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";
import { getAuthDatabase } from "@/server/data/auth-database";

import { accessControl, authRoles } from "./roles";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules";

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
      // Resetting a password signs that person out everywhere.
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // Sliding expiry: each visit (at most once a day) pushes the end date
      // out again, so you're only asked to sign in after a month away.
      expiresIn: env.SESSION_MAX_AGE_DAYS * DAY_IN_SECONDS,
      updateAge: DAY_IN_SECONDS,
    },
    rateLimit: {
      // On in production (Better Auth's default). Counts live in memory,
      // which suits our single server (ADR-020).
      customRules: {
        // About one attempt every 12 seconds per visitor, on average.
        "/sign-in/email": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
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
    plugins: [
      // Households (ADR-004, ADR-017). Better Auth calls them organizations;
      // our tables call them workspaces, so a contracting company could be
      // one later. The app calls them households.
      organization({
        ac: accessControl,
        roles: authRoles,
        creatorRole: "owner",
        // People can't create households from the browser. The setup
        // command (and later, an owner action) creates them on the server.
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        // Invitation links last a week. Inviting the same email again
        // cancels the older link.
        invitationExpiresIn: 7 * DAY_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        schema: {
          session: { fields: { activeOrganizationId: "activeWorkspaceId" } },
          organization: {
            modelName: "workspace",
            additionalFields: {
              kind: { type: "string", required: false, defaultValue: "household", input: false },
            },
          },
          member: { modelName: "membership", fields: { organizationId: "workspaceId" } },
          invitation: { fields: { organizationId: "workspaceId" } },
        },
      }),
      // nextCookies lets Server Actions set and clear the login cookie.
      // It must stay last in this list.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
