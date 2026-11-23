import type { Role } from "./roles";

/**
 * Everything a person might try to do in a workspace. Add new actions here
 * (never scattered `if (role === "owner")` checks), so the rules stay in one
 * place (ADR-007, ADR-017).
 */
export type Action =
  | "records:view" // see projects, rooms, budget, documents
  | "records:edit" // create and edit records
  | "budget:approve" // approve quotes, baseline budgets, transfer budget
  | "members:manage" // invite or remove people, change roles
  | "workspace:manage"; // export data, change household settings

const allowed: Record<Action, readonly Role[]> = {
  "records:view": ["owner", "member", "viewer"],
  "records:edit": ["owner", "member"],
  "budget:approve": ["owner", "member"],
  "members:manage": ["owner"],
  "workspace:manage": ["owner"],
};

export function can(context: { role: Role }, action: Action): boolean {
  return allowed[action].includes(context.role);
}

export class PermissionError extends Error {
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
  }
}

/** Throws unless the person's role allows the action. */
export function assertCan(context: { role: Role }, action: Action): void {
  if (!can(context, action)) throw new PermissionError(action);
}
