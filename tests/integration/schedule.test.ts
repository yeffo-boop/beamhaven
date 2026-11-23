import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { NotFoundError, RuleError } from "@/server/services/errors";
import {
  createMilestone,
  deleteMilestone,
  getMilestone,
  getMilestones,
  updateMilestone,
} from "@/server/services/milestones";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom } from "@/server/services/rooms";
import {
  addDependency,
  changeTaskStatus,
  createTask,
  deleteTask,
  getTask,
  getTasks,
  removeDependency,
  updateTask,
} from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

async function sql(text: string, values: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);
const rule = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toSatisfy((e) => e instanceof RuleError && e.code === code);

/** A kitchen project (and a bathroom one), and the kitchen room. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const room = (await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" }))
    .id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  const other = (
    await createProject(ctx, { propertyId: property, name: "Bathroom", status: "planning" })
  ).id;
  const task = async (title: string, more: Record<string, string> = {}) =>
    (await createTask(ctx, { title, projectId: project, ...more })).id;
  return { user, workspaceId, ctx, property, room, project, other, task };
}

describe("milestones", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("groups a project's tasks and shows how each stage is going", async () => {
    const a = await household("Ana");
    const demo = (
      await createMilestone(a.ctx, a.project, { name: "Demolition", targetDate: "2026-12-01" })
    ).id;
    const cabinets = (await createMilestone(a.ctx, a.project, { name: "Cabinets in" })).id;
    await expect(createMilestone(a.ctx, a.project, { name: "Demolition" })).rejects.toThrow(
      /already has a milestone with that name/,
    );
    // Another project may use the same name.
    await createMilestone(a.ctx, a.other, { name: "Demolition" });

    const tearOut = await a.task("Tear out cabinets", { milestoneId: demo });
    await a.task("Haul away", { milestoneId: demo });
    await a.task("Hang cabinets", { milestoneId: cabinets });
    await changeTaskStatus(a.ctx, tearOut, "done");
    // Dated ones first.
    expect(
      (await getMilestones(a.ctx, { projectId: a.project })).map((m) => [
        m.name,
        m.doneCount,
        m.taskCount,
      ]),
    ).toEqual([
      ["Demolition", 1, 2],
      ["Cabinets in", 0, 1],
    ]);
    expect((await getTask(a.ctx, tearOut)).milestoneName).toBe("Demolition");
    expect(await getTasks(a.ctx, { milestoneId: demo })).toHaveLength(2);

    // A milestone belongs to its project: not another project's task, nor a room-only one.
    await expect(
      createTask(a.ctx, { title: "Tile", projectId: a.other, milestoneId: demo }),
    ).rejects.toThrow(/milestone is on another project/);
    await expect(
      createTask(a.ctx, { title: "Tile", roomId: a.room, milestoneId: demo }),
    ).rejects.toThrow(/milestone is on another project/);

    await updateMilestone(a.ctx, cabinets, { name: "Cabinets hung", targetDate: "2026-12-20" });
    expect(await getMilestone(a.ctx, cabinets)).toMatchObject({ name: "Cabinets hung" });

    // Deleting a milestone keeps its tasks on the project.
    await deleteMilestone(a.ctx, demo);
    expect(await getTask(a.ctx, tearOut)).toMatchObject({
      milestoneId: null,
      projectId: a.project,
    });

    // Deleting the project takes its milestones; a task also in a room stays there, out of the milestone.
    const inRoom = await a.task("Paint", { roomId: a.room, milestoneId: cabinets });
    await deleteProject(a.ctx, a.project);
    await notFound(getMilestone(a.ctx, cabinets));
    expect(await getTask(a.ctx, inRoom)).toMatchObject({
      projectId: null,
      milestoneId: null,
      roomId: a.room,
    });
  });
});

describe("tasks that wait on others", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("are blocked until what they wait on is done", async () => {
    const a = await household("Ana");
    const drywall = await a.task("Finish drywall");
    const electrical = await a.task("Rough-in electrical");
    const cabinets = await a.task("Hang cabinets");
    await addDependency(a.ctx, cabinets, drywall);
    await addDependency(a.ctx, drywall, electrical);

    let task = await getTask(a.ctx, cabinets);
    expect(task.waitsOn.map((t) => t.title)).toEqual(["Finish drywall"]);
    expect(task.blockedBy.map((t) => t.title)).toEqual(["Finish drywall"]);
    expect((await getTask(a.ctx, drywall)).neededFor.map((t) => t.title)).toEqual([
      "Hang cabinets",
    ]);
    // Can't be finished yet, from the list or from its page; starting is fine.
    await rule(changeTaskStatus(a.ctx, cabinets, "done"), "task_blocked");
    await expect(
      updateTask(a.ctx, cabinets, { title: "Hang cabinets", projectId: a.project, status: "done" }),
    ).rejects.toThrow(/waits on “Finish drywall”/);
    await changeTaskStatus(a.ctx, cabinets, "doing");

    await changeTaskStatus(a.ctx, electrical, "done");
    await changeTaskStatus(a.ctx, drywall, "done");
    task = await getTask(a.ctx, cabinets);
    expect(task.blockedBy).toEqual([]);
    await changeTaskStatus(a.ctx, cabinets, "done");
    // Reopening what it waited on doesn't undo a finished task.
    await changeTaskStatus(a.ctx, drywall, "todo");
    expect((await getTask(a.ctx, cabinets)).status).toBe("done");
  });

  it("refuses loops, repeats and waiting on itself", async () => {
    const a = await household("Ana");
    const one = await a.task("One");
    const two = await a.task("Two");
    const three = await a.task("Three");
    await addDependency(a.ctx, one, two);
    await addDependency(a.ctx, two, three);
    await expect(addDependency(a.ctx, two, one)).rejects.toThrow(/make a loop/);
    await expect(addDependency(a.ctx, three, one)).rejects.toThrow(/make a loop/);
    await expect(addDependency(a.ctx, one, two)).rejects.toThrow(/already waits on that task/);
    await expect(addDependency(a.ctx, one, one)).rejects.toThrow(/can't wait on itself/);
    await expect(addDependency(a.ctx, one, "")).rejects.toThrow(/Choose the task/);
    // Waiting across projects is fine.
    const bath = (await createTask(a.ctx, { title: "Bath tile", projectId: a.other })).id;
    await addDependency(a.ctx, three, bath);

    // Removing a wait, or the task waited on, unblocks.
    await removeDependency(a.ctx, one, two);
    expect((await getTask(a.ctx, one)).waitsOn).toEqual([]);
    await notFound(removeDependency(a.ctx, one, two));
    await deleteTask(a.ctx, bath);
    expect((await getTask(a.ctx, three)).waitsOn).toEqual([]);
    // Now the loop is gone, the other direction is allowed.
    await addDependency(a.ctx, two, one);
  });

  it("keeps every household's milestones and waits to itself, and viewers out", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const aTask = await a.task("Mine");
    const bTask = await b.task("Theirs");
    const bMilestone = (await createMilestone(b.ctx, b.project, { name: "Demo" })).id;
    await notFound(addDependency(a.ctx, aTask, bTask));
    await notFound(addDependency(a.ctx, bTask, aTask));
    await addDependency(b.ctx, bTask, await b.task("Theirs too"));
    await notFound(getMilestone(a.ctx, bMilestone));
    await notFound(updateMilestone(a.ctx, bMilestone, { name: "X" }));
    await notFound(deleteMilestone(a.ctx, bMilestone));
    await notFound(createMilestone(a.ctx, b.project, { name: "X" }));
    await notFound(
      createTask(a.ctx, { title: "X", projectId: a.project, milestoneId: bMilestone }),
    );
    expect(await getMilestones(a.ctx)).toEqual([]);

    // In the database itself, too.
    await expect(
      sql(
        `INSERT INTO task_dependencies (workspace_id, task_id, depends_on_id) VALUES ($1, $2, $3)`,
        [a.workspaceId, aTask, bTask],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        `INSERT INTO task_dependencies (workspace_id, task_id, depends_on_id) VALUES ($1, $2, $2)`,
        [a.workspaceId, aTask],
      ),
    ).rejects.toThrow(/task_dependencies_self_check/);
    const aMilestone = (await createMilestone(a.ctx, a.project, { name: "Demo" })).id;
    await expect(
      sql(`UPDATE tasks SET milestone_id = $1, project_id = $2 WHERE id = $3`, [
        aMilestone,
        a.other,
        aTask,
      ]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE tasks SET milestone_id = $1, project_id = NULL, room_id = $2 WHERE id = $3`, [
        aMilestone,
        a.room,
        aTask,
      ]),
    ).rejects.toThrow(/tasks_milestone_project_check/);

    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect(await getMilestones(viewer)).toHaveLength(1);
    await forbidden(createMilestone(viewer, a.project, { name: "X" }));
    await forbidden(updateMilestone(viewer, aMilestone, { name: "X" }));
    await forbidden(deleteMilestone(viewer, aMilestone));
    const other = await a.task("Other");
    await forbidden(addDependency(viewer, aTask, other));
    await forbidden(removeDependency(viewer, aTask, other));
  });
});
