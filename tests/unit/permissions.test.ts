import { describe, expect, it } from "vitest";

import { can, type Action } from "@/server/auth/permissions";
import type { Role } from "@/server/auth/roles";

// The table from docs/DATA_MODEL.md, "Roles". If this test changes, that
// document must change too.
const expected: Record<Action, Record<Role, boolean>> = {
  "records:view": { owner: true, member: true, viewer: true },
  "records:edit": { owner: true, member: true, viewer: false },
  "budget:approve": { owner: true, member: true, viewer: false },
  "members:manage": { owner: true, member: false, viewer: false },
  "workspace:manage": { owner: true, member: false, viewer: false },
};

describe("can()", () => {
  for (const [action, byRole] of Object.entries(expected)) {
    for (const [role, result] of Object.entries(byRole)) {
      it(`${role} ${result ? "can" : "cannot"} ${action}`, () => {
        expect(can({ role: role as Role }, action as Action)).toBe(result);
      });
    }
  }
});
