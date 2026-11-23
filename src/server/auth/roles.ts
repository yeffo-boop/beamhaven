import { createAccessControl } from "better-auth/plugins/access";

/**
 * Roles inside a workspace (shown as a "household" in the app).
 * See docs/DATA_MODEL.md, "Roles", and ADR-017.
 */
export const ROLES = ["owner", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * What Better Auth's own household endpoints (invitations, members) may do.
 * Rules for BeamHaven's records (projects, budgets…) live in permissions.ts.
 * Teams and custom roles aren't used, so nobody gets those permissions.
 */
const statements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const;

export const accessControl = createAccessControl(statements);

export const authRoles = {
  owner: accessControl.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  member: accessControl.newRole({}),
  viewer: accessControl.newRole({}),
} satisfies Record<Role, unknown>;
