import { beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/server/auth/auth";
import { createFirstAccount, FirstAccountError } from "@/server/auth/first-account";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import { getWorkspace } from "@/server/data/workspaces";

import { resetDatabase } from "../support/reset-database";

const owner = {
  name: "Test Owner",
  householdName: "Test Household",
  email: "Owner@Example.com",
  password: "correct horse battery",
};

describe("first account and sign-in", () => {
  beforeEach(resetDatabase);

  it("creates the first account, and the password works for sign-in", async () => {
    const created = await createFirstAccount(owner);
    expect(created.email).toBe("owner@example.com");

    // ...as the owner of a new household with the name they gave.
    const ctx = await resolveWorkspaceContext(created.id);
    expect(ctx?.role).toBe("owner");
    if (ctx) expect((await getWorkspace(ctx)).name).toBe("Test Household");

    const result = await getAuth().api.signInEmail({
      body: { email: "owner@example.com", password: owner.password },
    });
    expect(result.user.email).toBe("owner@example.com");
    expect(result.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    await createFirstAccount(owner);
    await expect(
      getAuth().api.signInEmail({
        body: { email: "owner@example.com", password: "not the right password" },
      }),
    ).rejects.toThrow();
  });

  it("only works once", async () => {
    await createFirstAccount(owner);
    await expect(
      createFirstAccount({ ...owner, email: "someone-else@example.com" }),
    ).rejects.toBeInstanceOf(FirstAccountError);
  });

  it("refuses passwords shorter than 12 characters", async () => {
    await expect(createFirstAccount({ ...owner, password: "short-pass" })).rejects.toThrow(
      /at least 12/,
    );
  });

  it("has public sign-up switched off", async () => {
    await expect(
      getAuth().api.signUpEmail({
        body: { name: "Stranger", email: "stranger@example.com", password: "a long password here" },
      }),
    ).rejects.toThrow();
  });

  it("signing out deletes the session, so the old cookie stops working", async () => {
    await createFirstAccount(owner);
    const { headers: responseHeaders } = await getAuth().api.signInEmail({
      body: { email: "owner@example.com", password: owner.password },
      returnHeaders: true,
    });
    const cookie = responseHeaders.get("set-cookie")?.split(";")[0] ?? "";
    const headers = new Headers({ cookie });

    expect(await getAuth().api.getSession({ headers })).not.toBeNull();
    await getAuth().api.signOut({ headers });
    expect(await getAuth().api.getSession({ headers })).toBeNull();
  });
});
