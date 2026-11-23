import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/server/auth/auth";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  cancelInvitation,
  createInvitationLink,
  getInvitationState,
  InvitationError,
} from "@/server/auth/invitations";
import {
  createPasswordResetLinkForMember,
  ResetNotAllowedError,
} from "@/server/auth/password-reset";
import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";

import {
  addMember,
  createHousehold,
  createUser,
  signedInHeaders,
  TEST_PASSWORD,
} from "../support/households";
import { resetDatabase } from "../support/reset-database";

const NEW_PASSWORD = "a brand new password";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

function invitationIdFrom(link: string): string {
  const match = /\/invite\/([^/?]+)$/.exec(link);
  if (!match?.[1]) throw new Error(`Unexpected link: ${link}`);
  return match[1];
}

async function sql(text: string, values: unknown[]): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

describe("invitations", () => {
  let owner: { id: string; email: string };
  let householdA: string;
  let ownerCtx: WorkspaceContext;
  let ownerHeaders: Headers;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Olivia");
    householdA = await createHousehold("Household A", owner.id);
    ownerCtx = await contextFor(owner.id, householdA);
    ownerHeaders = await signedInHeaders(owner.email);
  });

  it("builds the link from APP_URL", async () => {
    const link = await createInvitationLink(ownerCtx, ownerHeaders, {
      email: "Partner@Example.com",
      role: "owner",
    });
    expect(link.startsWith(`${process.env["APP_URL"]?.replace(/\/$/, "")}/invite/`)).toBe(true);
  });

  it("lets a new person create an account and join with the invited role, once", async () => {
    const link = await createInvitationLink(ownerCtx, ownerHeaders, {
      email: "partner@example.com",
      role: "owner",
    });
    const id = invitationIdFrom(link);
    const state = await getInvitationState(id);
    expect(state.kind === "usable" && state.invitation.workspaceName).toBe("Household A");

    await acceptInvitationAsNewUser(id, {
      name: "Pat",
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const { user } = await getAuth().api.signInEmail({
      body: { email: "partner@example.com", password: NEW_PASSWORD },
    });
    expect((await resolveWorkspaceContext(user.id, householdA))?.role).toBe("owner");

    // The link is used up.
    expect((await getInvitationState(id)).kind).toBe("unusable");
    await expect(
      acceptInvitationAsNewUser(id, {
        name: "Someone else",
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvitationError);
  });

  it("refuses cancelled, expired and made-up links", async () => {
    const cancelledId = invitationIdFrom(
      await createInvitationLink(ownerCtx, ownerHeaders, {
        email: "a@example.com",
        role: "member",
      }),
    );
    await cancelInvitation(ownerCtx, ownerHeaders, cancelledId);

    const expiredId = invitationIdFrom(
      await createInvitationLink(ownerCtx, ownerHeaders, {
        email: "b@example.com",
        role: "member",
      }),
    );
    await sql("UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      expiredId,
    ]);

    for (const id of [cancelledId, expiredId, "made-up-id"]) {
      expect((await getInvitationState(id)).kind).toBe("unusable");
      await expect(
        acceptInvitationAsNewUser(id, {
          name: "X",
          password: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(InvitationError);
    }
  });

  it("only owners can invite, and only into their own household", async () => {
    const member = await createUser("Max");
    await addMember(householdA, member.id, "member");
    const memberCtx = await contextFor(member.id, householdA);
    await expect(
      createInvitationLink(memberCtx, await signedInHeaders(member.email), {
        email: "x@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(PermissionError);

    // An owner of household B can't cancel household A's invitation.
    const otherOwner = await createUser("Otto");
    const householdB = await createHousehold("Household B", otherOwner.id);
    const id = invitationIdFrom(
      await createInvitationLink(ownerCtx, ownerHeaders, {
        email: "c@example.com",
        role: "member",
      }),
    );
    await cancelInvitation(
      await contextFor(otherOwner.id, householdB),
      await signedInHeaders(otherOwner.email),
      id,
    );
    expect((await getInvitationState(id)).kind).toBe("usable");
  });

  it("lets someone with an account join, but only as the invited email", async () => {
    const existing = await createUser("Erin");
    const stranger = await createUser("Sam");
    const id = invitationIdFrom(
      await createInvitationLink(ownerCtx, ownerHeaders, { email: existing.email, role: "viewer" }),
    );
    const state = await getInvitationState(id);
    expect(state.kind === "usable" && state.hasAccount).toBe(true);

    // A brand-new account can't be made for an email that already has one.
    await expect(
      acceptInvitationAsNewUser(id, {
        name: "Imposter",
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvitationError);
    await expect(acceptInvitationAsExistingUser(id, stranger)).rejects.toBeInstanceOf(
      InvitationError,
    );

    await acceptInvitationAsExistingUser(id, existing);
    expect((await resolveWorkspaceContext(existing.id, householdA))?.role).toBe("viewer");
    expect(await resolveWorkspaceContext(stranger.id, householdA)).toBeNull();
  });
});

describe("password-reset links", () => {
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let householdA: string;
  let ownerCtx: WorkspaceContext;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Olivia");
    member = await createUser("Max");
    householdA = await createHousehold("Household A", owner.id);
    await addMember(householdA, member.id, "member");
    ownerCtx = await contextFor(owner.id, householdA);
  });

  it("an owner's link resets the password once and signs the person out everywhere", async () => {
    const oldSession = await signedInHeaders(member.email);
    const link = await createPasswordResetLinkForMember(ownerCtx, member.id);
    expect(link).toContain("/reset-password?token=");
    const token = new URL(link).searchParams.get("token") ?? "";

    await getAuth().api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } });

    expect(await getAuth().api.getSession({ headers: oldSession })).toBeNull();
    await expect(
      getAuth().api.signInEmail({ body: { email: member.email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    await getAuth().api.signInEmail({ body: { email: member.email, password: NEW_PASSWORD } });

    // Used up.
    await expect(
      getAuth().api.resetPassword({ body: { token, newPassword: "yet another password" } }),
    ).rejects.toThrow();
  });

  it("members can't make reset links", async () => {
    const memberCtx = await contextFor(member.id, householdA);
    await expect(createPasswordResetLinkForMember(memberCtx, owner.id)).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("owners can't make links for people outside their household", async () => {
    const outsider = await createUser("Otto");
    await createHousehold("Household B", outsider.id);
    await expect(createPasswordResetLinkForMember(ownerCtx, outsider.id)).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("owners can't make links for someone who also belongs to another household", async () => {
    const otherOwner = await createUser("Otto");
    const householdB = await createHousehold("Household B", otherOwner.id);
    await addMember(householdB, member.id, "viewer");
    await expect(createPasswordResetLinkForMember(ownerCtx, member.id)).rejects.toBeInstanceOf(
      ResetNotAllowedError,
    );
  });
});
