import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/server/auth/auth";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import { getWorkspace, listMembers } from "@/server/data/workspaces";

import {
  addMember,
  createHousehold,
  createUser,
  membershipId,
  signedInHeaders,
} from "../support/households";
import { resetDatabase } from "../support/reset-database";

/**
 * Isolation tests (ROADMAP, Milestone 2): someone in household A must not be
 * able to see or change anything in household B. Each new kind of household
 * record (projects, budgets, files…) adds its own checks to this pattern.
 */
describe("household isolation", () => {
  let alice: { id: string; email: string }; // owner of A
  let bob: { id: string; email: string }; // owner of B
  let carol: { id: string; email: string }; // member of A, viewer in B
  let householdA: string;
  let householdB: string;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    carol = await createUser("Carol");
    householdA = await createHousehold("Household A", alice.id);
    householdB = await createHousehold("Household B", bob.id);
    await addMember(householdA, carol.id, "member");
    await addMember(householdB, carol.id, "viewer");
  });

  describe("choosing a household", () => {
    it("never gives someone a household they don't belong to", async () => {
      expect(await resolveWorkspaceContext(alice.id, householdB)).toBeNull();
      expect(await resolveWorkspaceContext(bob.id, householdA)).toBeNull();
      expect(await resolveWorkspaceContext(alice.id, "made-up-id")).toBeNull();
    });

    it("uses the person's own household by default", async () => {
      expect(await resolveWorkspaceContext(alice.id)).toEqual({
        workspaceId: householdA,
        userId: alice.id,
        role: "owner",
      });
    });

    it("applies each household's own role to someone in two households", async () => {
      expect((await resolveWorkspaceContext(carol.id, householdA))?.role).toBe("member");
      expect((await resolveWorkspaceContext(carol.id, householdB))?.role).toBe("viewer");
    });
  });

  describe("the data layer", () => {
    it("only lists the current household's people", async () => {
      const ctxA = await resolveWorkspaceContext(alice.id);
      const ctxB = await resolveWorkspaceContext(bob.id);
      if (!ctxA || !ctxB) throw new Error("setup failed");

      const emailsA = (await listMembers(ctxA)).map((m) => m.email);
      const emailsB = (await listMembers(ctxB)).map((m) => m.email);
      expect(emailsA).toEqual([alice.email, carol.email]);
      expect(emailsB).toEqual([bob.email, carol.email]);
      expect((await getWorkspace(ctxA)).name).toBe("Household A");
    });
  });

  describe("Better Auth's household endpoints", () => {
    it("won't show another household's details or members", async () => {
      const headers = await signedInHeaders(alice.email);
      // Control: her own household works, so the failures below are real.
      const own = await getAuth().api.getFullOrganization({
        headers,
        query: { organizationId: householdA },
      });
      expect(own?.name).toBe("Household A");

      await expect(
        getAuth().api.getFullOrganization({ headers, query: { organizationId: householdB } }),
      ).rejects.toThrow();
      await expect(
        getAuth().api.listMembers({ headers, query: { organizationId: householdB } }),
      ).rejects.toThrow();
    });

    it("won't switch someone into another household", async () => {
      const headers = await signedInHeaders(alice.email);
      await expect(
        getAuth().api.setActiveOrganization({ headers, body: { organizationId: householdB } }),
      ).rejects.toThrow();
    });

    it("won't let an owner change people in another household", async () => {
      const headers = await signedInHeaders(alice.email);
      // Control: she can change roles in her own household.
      await getAuth().api.updateMemberRole({
        headers,
        body: {
          organizationId: householdA,
          memberId: await membershipId(householdA, carol.id),
          role: "viewer",
        },
      });
      expect((await resolveWorkspaceContext(carol.id, householdA))?.role).toBe("viewer");

      await expect(
        getAuth().api.updateMemberRole({
          headers,
          body: {
            organizationId: householdB,
            memberId: await membershipId(householdB, bob.id),
            role: "viewer",
          },
        }),
      ).rejects.toThrow();
      await expect(
        getAuth().api.updateMemberRole({
          headers,
          body: {
            organizationId: householdA,
            memberId: await membershipId(householdB, carol.id),
            role: "owner",
          },
        }),
      ).rejects.toThrow();
      expect((await resolveWorkspaceContext(bob.id, householdB))?.role).toBe("owner");
      expect((await resolveWorkspaceContext(carol.id, householdB))?.role).toBe("viewer");
      await expect(
        getAuth().api.removeMember({
          headers,
          body: { organizationId: householdB, memberIdOrEmail: bob.email },
        }),
      ).rejects.toThrow();
    });

    it("only lets owners invite people", async () => {
      // Control: an owner can invite into their own household.
      const invitation = await getAuth().api.createInvitation({
        headers: await signedInHeaders(alice.email),
        body: { organizationId: householdA, email: "new@example.com", role: "member" },
      });
      expect(invitation.email).toBe("new@example.com");

      const carolHeaders = await signedInHeaders(carol.email);
      for (const organizationId of [householdA, householdB]) {
        await expect(
          getAuth().api.createInvitation({
            headers: carolHeaders,
            body: { organizationId, email: "other@example.com", role: "member" },
          }),
        ).rejects.toThrow();
      }
    });

    it("won't let anyone create a household from the browser", async () => {
      const headers = await signedInHeaders(alice.email);
      await expect(
        getAuth().api.createOrganization({ headers, body: { name: "Sneaky", slug: "sneaky" } }),
      ).rejects.toThrow();
    });
  });

  it("the database refuses any role other than owner, member or viewer", async () => {
    const client = new Client({ connectionString: process.env["DATABASE_URL"] });
    await client.connect();
    try {
      await expect(
        client.query(
          "UPDATE memberships SET role = 'admin' WHERE user_id = $1 AND workspace_id = $2",
          [carol.id, householdA],
        ),
      ).rejects.toThrow(/memberships_role_check/);
    } finally {
      await client.end();
    }
  });
});
