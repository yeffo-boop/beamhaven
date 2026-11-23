import "server-only";

import { assertCan } from "@/server/auth/permissions";
import type { WorkspaceContext } from "@/server/data/context";
import { listContractors } from "@/server/data/contractors";
import { listProjects } from "@/server/data/projects";
import { listRooms } from "@/server/data/rooms";
import { listMembers } from "@/server/data/workspaces";

export type Choice = { value: string; label: string };

export type RecordChoices = {
  projects: Choice[];
  rooms: Choice[];
  contractors: Choice[];
  /** People and contractors a task can go to: "user:<id>" or "contractor:<id>". */
  assignees: Choice[];
};

/** The pick lists that the contractor, warranty and task forms offer. */
export async function getRecordChoices(ctx: WorkspaceContext): Promise<RecordChoices> {
  assertCan(ctx, "records:edit");
  const [projects, rooms, contractors, members] = await Promise.all([
    listProjects(ctx),
    listRooms(ctx),
    listContractors(ctx),
    listMembers(ctx),
  ]);
  const usable = contractors.filter((c) => c.status !== "do_not_use");
  return {
    projects: projects
      .map((p) => ({ value: p.id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    rooms: rooms.map((r) => ({ value: r.id, label: r.name })),
    contractors: contractors.map((c) => ({ value: c.id, label: c.name })),
    assignees: [
      ...members
        .filter((m) => m.role !== "viewer")
        .map((m) => ({ value: `user:${m.userId}`, label: m.name })),
      ...usable.map((c) => ({ value: `contractor:${c.id}`, label: c.name })),
    ],
  };
}

/** For people who can only look: nothing to choose. */
export const NO_CHOICES: RecordChoices = {
  projects: [],
  rooms: [],
  contractors: [],
  assignees: [],
};
