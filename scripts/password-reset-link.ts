/**
 * Makes a one-time password-reset link for any account, for the server
 * admin. Use it when nobody who could make one in Settings can sign in
 * (for example, the only owner forgot their password).
 *
 *   npm run password-reset-link -- someone@example.com
 *
 * The link works once, for 24 hours. Using it signs that person out everywhere.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Give the account's email, for example:");
    console.error("  npm run password-reset-link -- someone@example.com");
    process.exit(1);
  }
  // Imported after .env is loaded, because they read settings when used.
  const { findUserIdByEmail } = await import("@/server/data/users");
  const { createPasswordResetLink } = await import("@/server/auth/password-reset");

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    console.error(`No account uses ${email}. Nothing was created.`);
    process.exit(1);
  }
  const link = await createPasswordResetLink(userId);
  console.log(`\nPassword reset link for ${email} (works once, for 24 hours):\n\n  ${link}\n`);
  process.exit(0);
}

void main();
