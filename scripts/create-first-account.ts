/**
 * One-time setup: creates the first BeamHaven login.
 *
 *   npm run create-first-account
 *
 * It asks for a name, email and password (the password is not shown while
 * you type and never lands in your shell history). For automated tests, the
 * answers can come from FIRST_ACCOUNT_NAME, FIRST_ACCOUNT_EMAIL and
 * FIRST_ACCOUNT_PASSWORD instead.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { loadEnvConfig } from "@next/env";
import { z } from "zod";

loadEnvConfig(process.cwd());

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

/** Like ask(), but nothing appears on screen while typing. */
function askHidden(question: string): Promise<string> {
  stdout.write(question);
  if (!stdin.isTTY) return ask("");
  return new Promise((resolve) => {
    let answer = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(answer);
          return;
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f" || char === "\b") answer = answer.slice(0, -1);
        else answer += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  // Imported after .env is loaded, because they read settings when used.
  const { createFirstAccount, FirstAccountError } = await import("@/server/auth/first-account");

  const fromEnv = process.env["FIRST_ACCOUNT_EMAIL"] !== undefined;
  let input;
  if (fromEnv) {
    input = {
      name: process.env["FIRST_ACCOUNT_NAME"] ?? "",
      email: process.env["FIRST_ACCOUNT_EMAIL"] ?? "",
      password: process.env["FIRST_ACCOUNT_PASSWORD"] ?? "",
    };
  } else {
    console.log("Create the first BeamHaven account.\n");
    const name = await ask("Your name: ");
    const email = await ask("Email: ");
    const password = await askHidden("Password (at least 12 characters, hidden): ");
    const again = await askHidden("Same password again: ");
    if (password !== again) {
      console.error("\nThe two passwords don't match. Nothing was created; please run it again.");
      process.exit(1);
    }
    input = { name, email, password };
  }

  try {
    const user = await createFirstAccount(input);
    console.log(`\nDone. ${user.email} can now sign in.`);
    process.exit(0);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("\nNothing was created:");
      for (const issue of error.issues)
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    } else if (isMissingTable(error)) {
      console.error(
        "\nThe database tables don't exist yet. Run `npm run db:migrate` first, then try again.",
      );
    } else if (error instanceof FirstAccountError) {
      console.error(`\n${error.message}`);
    } else {
      console.error("\nSomething went wrong. Nothing should have been created.");
      console.error(error);
    }
    process.exit(1);
  }
}

/** Prisma's error code P2021 means "table does not exist". */
function isMissingTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2021";
}

void main();
