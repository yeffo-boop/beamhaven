import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import {
  getDocuments,
  readFileForDownload,
  UploadError,
  uploadDocument,
} from "@/server/services/attachments";
import { createLine, getCategories } from "@/server/services/budget";
import {
  addContractorToProject,
  createContractor,
  deleteContractor,
  getCommunications,
  getContractor,
  getContractors,
  getProjectContractors,
  logCommunication,
  removeContractorFromProject,
  updateContractor,
} from "@/server/services/contractors";
import { NotFoundError } from "@/server/services/errors";
import { createExpense, getVendorMoney } from "@/server/services/expenses";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom, deleteRoom } from "@/server/services/rooms";
import {
  changeTaskStatus,
  createTask,
  createWarranty,
  deleteTask,
  deleteWarranty,
  getTask,
  getTasks,
  getWarranties,
  getWarranty,
  updateTask,
  updateWarranty,
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

const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");

/** A household with a property, a kitchen, a project and one contractor on it. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const room = (await createRoom(ctx, { propertyId: property, name: "Kitchen", type: "kitchen" }))
    .id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "planning" })
  ).id;
  const contractor = (
    await createContractor(ctx, {
      name: `${name} Builders`,
      trade: "General contractor",
      status: "active",
      email: "Office@Example.com",
      website: "example.com",
      insuranceExpiresOn: "2026-12-01",
    })
  ).id;
  await addContractorToProject(ctx, contractor, { projectId: project, role: "Cabinets" });
  return { user, workspaceId, ctx, property, room, project, contractor };
}

describe("contractors", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps a directory with contact, license and insurance details", async () => {
    const a = await household("Ana");
    const c = await getContractor(a.ctx, a.contractor);
    expect(c).toMatchObject({
      name: "Ana Builders",
      trade: "General contractor",
      email: "office@example.com",
      website: "https://example.com/",
      status: "active",
    });
    expect(c.insuranceExpiresOn?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(c.projects).toEqual([
      { projectId: a.project, projectName: "Kitchen", role: "Cabinets" },
    ]);
    expect(await getProjectContractors(a.ctx, a.project)).toHaveLength(1);

    // A script address is refused, never stored as a link.
    await expect(
      updateContractor(a.ctx, a.contractor, {
        name: "Ana Builders LLC",
        status: "past",
        website: "javascript:alert(1)",
      }),
    ).rejects.toThrow(/web address/);
    await updateContractor(a.ctx, a.contractor, { name: "Ana Builders LLC", status: "past" });
    expect((await getContractor(a.ctx, a.contractor)).name).toBe("Ana Builders LLC");
    await expect(
      createContractor(a.ctx, { name: "ana builders llc", status: "active" }),
    ).rejects.toThrow(/Please fix|already/);

    await removeContractorFromProject(a.ctx, a.contractor, a.project);
    expect(await getProjectContractors(a.ctx, a.project)).toHaveLength(0);
  });

  it("is the same record as the budget's shop or supplier, so bills show up", async () => {
    const a = await household("Ana");
    const categories = await getCategories(a.ctx);
    const labor = categories.find((c) => c.name === "Labor")?.id ?? "";
    const line = (
      await createLine(a.ctx, { projectId: a.project, categoryId: labor, planned: "500" })
    ).id;
    // A bill recorded under the name before the contractor existed...
    await createExpense(a.ctx, {
      description: "Site visit",
      vendorName: "Pat's Plumbing",
      total: "120",
      expenseDate: "2026-11-20",
      allocations: [{ lineId: line, amount: "", kind: "item" }],
    });
    const plumber = (await createContractor(a.ctx, { name: "pat's plumbing", status: "active" }))
      .id;
    const c = await getContractor(a.ctx, plumber);
    // ...keeps the name as first typed, and shows on the contractor's page.
    expect(c.name).toBe("Pat's Plumbing");
    const money = await getVendorMoney(a.ctx, c.vendorId);
    expect(money.expenses.map((e) => e.description)).toEqual(["Site visit"]);

    // Deleting the contractor keeps the bill (and its shop name) in the budget.
    await deleteContractor(a.ctx, plumber);
    expect((await getVendorMoney(a.ctx, c.vendorId)).expenses).toHaveLength(1);
  });

  it("logs communication, newest first", async () => {
    const a = await household("Ana");
    await logCommunication(a.ctx, a.contractor, {
      channel: "call",
      occurredOn: "2026-11-01",
      summary: "Asked for a quote",
    });
    await logCommunication(a.ctx, a.contractor, {
      channel: "email",
      occurredOn: "2026-11-05",
      projectId: a.project,
      summary: "Quote arrived",
    });
    const log = await getCommunications(a.ctx, { contractorId: a.contractor });
    expect(log.map((e) => e.summary)).toEqual(["Quote arrived", "Asked for a quote"]);
    expect(log[0]).toMatchObject({ projectName: "Kitchen", createdByName: "Ana" });
    await expect(
      logCommunication(a.ctx, a.contractor, { channel: "pigeon", occurredOn: "2026-11-05" }),
    ).rejects.toThrow();
  });

  it("tracks warranties and documents, and keeps them when a project goes", async () => {
    const a = await household("Ana");
    const roof = (
      await createWarranty(a.ctx, {
        coverage: "Cabinet workmanship",
        contractorId: a.contractor,
        projectId: a.project,
        startsOn: "2026-12-01",
        expiresOn: "2027-12-01",
      })
    ).id;
    const projectOnly = (
      await createWarranty(a.ctx, { coverage: "Faucet", projectId: a.project, provider: "Moen" })
    ).id;
    await expect(createWarranty(a.ctx, { coverage: "Nothing linked" })).rejects.toThrow();
    await expect(
      createWarranty(a.ctx, {
        coverage: "Backwards",
        projectId: a.project,
        startsOn: "2027-01-01",
        expiresOn: "2026-01-01",
      }),
    ).rejects.toThrow();
    await updateWarranty(a.ctx, roof, {
      coverage: "Cabinet workmanship (2 years)",
      contractorId: a.contractor,
      projectId: a.project,
      expiresOn: "2028-12-01",
    });
    expect((await getWarranty(a.ctx, roof)).coverage).toBe("Cabinet workmanship (2 years)");

    await uploadDocument(
      a.ctx,
      { kind: "warranty", id: projectOnly },
      { name: "w.pdf", bytes: PDF },
    );
    await expect(
      uploadDocument(
        a.ctx,
        { kind: "contractor", id: a.contractor },
        { name: "x.svg", bytes: new TextEncoder().encode("<svg onload=alert(1)>") },
      ),
    ).rejects.toBeInstanceOf(UploadError);
    await uploadDocument(
      a.ctx,
      { kind: "contractor", id: a.contractor },
      { name: "insurance.pdf", bytes: PDF },
    );
    expect(await getDocuments(a.ctx, { kind: "contractor", id: a.contractor })).toHaveLength(1);

    // The project goes: the contractor's warranty stays with the contractor,
    // and the one only on the project goes with it (with its file).
    const [projectOnlyDoc] = await getDocuments(a.ctx, { kind: "warranty", id: projectOnly });
    await deleteProject(a.ctx, a.project);
    expect((await getWarranty(a.ctx, roof)).projectId).toBeNull();
    await notFound(getWarranty(a.ctx, projectOnly));
    await notFound(readFileForDownload(a.ctx, projectOnlyDoc?.fileId ?? ""));

    await deleteWarranty(a.ctx, roof);
    expect(await getWarranties(a.ctx, { contractorId: a.contractor })).toHaveLength(0);
  });

  it("keeps simple tasks on projects and rooms, assigned to a member or a contractor", async () => {
    const a = await household("Ana");
    const ben = await createUser("Ben");
    await addMember(a.workspaceId, ben.id, "member");
    const tile = (
      await createTask(a.ctx, {
        title: "Pick the tile",
        projectId: a.project,
        roomId: a.room,
        assignee: `user:${ben.id}`,
        dueDate: "2026-12-05",
        priority: "high",
      })
    ).id;
    const demo = (
      await createTask(a.ctx, {
        title: "Demo",
        projectId: a.project,
        assignee: `contractor:${a.contractor}`,
      })
    ).id;
    expect((await getTask(a.ctx, tile)).assigneeName).toBe("Ben");
    expect((await getTask(a.ctx, demo)).assigneeName).toBe("Ana Builders");
    expect(await getTasks(a.ctx, { assigneeContractorId: a.contractor })).toHaveLength(1);
    await expect(createTask(a.ctx, { title: "Floating" })).rejects.toThrow();
    // The new-task form sends no status: it starts as "To do".
    const blank = await createTask(a.ctx, {
      title: "Order",
      projectId: a.project,
      status: "",
      priority: "",
    });
    expect(await getTask(a.ctx, blank.id)).toMatchObject({ status: "todo", priority: "normal" });
    await deleteTask(a.ctx, blank.id);

    await changeTaskStatus(a.ctx, demo, "done");
    const done = await getTask(a.ctx, demo);
    expect(done.completedAt).not.toBeNull();
    // Finished tasks go to the bottom.
    expect((await getTasks(a.ctx, { projectId: a.project })).map((t) => t.title)).toEqual([
      "Pick the tile",
      "Demo",
    ]);
    await changeTaskStatus(a.ctx, demo, "todo");
    expect((await getTask(a.ctx, demo)).completedAt).toBeNull();
    await updateTask(a.ctx, tile, {
      title: "Pick the tile and grout",
      projectId: a.project,
      roomId: a.room,
      status: "doing",
    });
    expect(await getTask(a.ctx, tile)).toMatchObject({ status: "doing", assigneeName: null });

    // The contractor goes: their task stays, unassigned.
    await deleteContractor(a.ctx, a.contractor);
    expect((await getTask(a.ctx, demo)).assigneeContractorId).toBeNull();

    // The room goes: a task also on the project stays there.
    await deleteRoom(a.ctx, a.room);
    expect((await getTask(a.ctx, tile)).roomId).toBeNull();
    await deleteTask(a.ctx, tile);
    await notFound(getTask(a.ctx, tile));
  });

  it("can't assign a task to someone outside the household", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    await notFound(
      createTask(a.ctx, { title: "X", projectId: a.project, assignee: `user:${b.user.id}` }),
    );
    await notFound(
      createTask(a.ctx, {
        title: "X",
        projectId: a.project,
        assignee: `contractor:${b.contractor}`,
      }),
    );
  });

  it("keeps every household's contractor records to itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const bWarranty = (await createWarranty(b.ctx, { coverage: "Roof", projectId: b.project })).id;
    const bTask = (await createTask(b.ctx, { title: "Paint", projectId: b.project })).id;
    await logCommunication(b.ctx, b.contractor, {
      channel: "note",
      occurredOn: "2026-11-01",
      summary: "Secret",
    });
    const bDoc = await uploadDocument(
      b.ctx,
      { kind: "contractor", id: b.contractor },
      { name: "license.pdf", bytes: PDF },
    );

    expect((await getContractors(a.ctx)).map((c) => c.name)).toEqual(["Ana Builders"]);
    await notFound(getContractor(a.ctx, b.contractor));
    await notFound(updateContractor(a.ctx, b.contractor, { name: "Mine", status: "active" }));
    await notFound(deleteContractor(a.ctx, b.contractor));
    await notFound(addContractorToProject(a.ctx, b.contractor, { projectId: a.project }));
    await notFound(addContractorToProject(a.ctx, a.contractor, { projectId: b.project }));
    await notFound(removeContractorFromProject(a.ctx, b.contractor, b.project));
    await notFound(
      logCommunication(a.ctx, b.contractor, {
        channel: "note",
        occurredOn: "2026-11-01",
        summary: "Hi",
      }),
    );
    await notFound(
      logCommunication(a.ctx, a.contractor, {
        channel: "note",
        occurredOn: "2026-11-01",
        projectId: b.project,
        summary: "Hi",
      }),
    );
    expect(await getCommunications(a.ctx, { contractorId: b.contractor })).toEqual([]);

    await notFound(getWarranty(a.ctx, bWarranty));
    await notFound(updateWarranty(a.ctx, bWarranty, { coverage: "Mine", projectId: a.project }));
    await notFound(deleteWarranty(a.ctx, bWarranty));
    await notFound(createWarranty(a.ctx, { coverage: "X", projectId: b.project }));
    await notFound(createWarranty(a.ctx, { coverage: "X", contractorId: b.contractor }));
    await notFound(createWarranty(a.ctx, { coverage: "X", roomId: b.room }));

    await notFound(getTask(a.ctx, bTask));
    await notFound(updateTask(a.ctx, bTask, { title: "Mine", projectId: a.project }));
    await notFound(changeTaskStatus(a.ctx, bTask, "done"));
    await notFound(deleteTask(a.ctx, bTask));
    await notFound(createTask(a.ctx, { title: "X", roomId: b.room }));
    expect(await getTasks(a.ctx, { projectId: b.project })).toEqual([]);

    await notFound(
      uploadDocument(
        a.ctx,
        { kind: "contractor", id: b.contractor },
        { name: "x.pdf", bytes: PDF },
      ),
    );
    await notFound(
      uploadDocument(a.ctx, { kind: "warranty", id: bWarranty }, { name: "x.pdf", bytes: PDF }),
    );
    await notFound(readFileForDownload(a.ctx, bDoc.fileId));
  });

  it("refuses cross-household links in the database itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    // Straight SQL, skipping every check in the code: the foreign keys
    // include the household, so these can't point across.
    await expect(
      sql(
        `INSERT INTO contractor_projects (workspace_id, contractor_id, project_id) VALUES ($1, $2, $3)`,
        [a.workspaceId, a.contractor, b.project],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        `INSERT INTO tasks (id, workspace_id, project_id, title, updated_at) VALUES ('t1', $1, $2, 'x', now())`,
        [a.workspaceId, b.project],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        `INSERT INTO warranties (id, workspace_id, contractor_id, coverage, updated_at) VALUES ('w1', $1, $2, 'x', now())`,
        [a.workspaceId, b.contractor],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(
        `INSERT INTO tasks (id, workspace_id, title, updated_at) VALUES ('t2', $1, 'nowhere', now())`,
        [a.workspaceId],
      ),
    ).rejects.toThrow(/tasks_linked_check/);
    await expect(
      sql(`UPDATE contractors SET status = 'maybe' WHERE id = $1`, [a.contractor]),
    ).rejects.toThrow(/contractors_status_check/);
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect(await getContractors(viewer)).toHaveLength(1);
    await forbidden(createContractor(viewer, { name: "X", status: "active" }));
    await forbidden(updateContractor(viewer, a.contractor, { name: "X", status: "active" }));
    await forbidden(deleteContractor(viewer, a.contractor));
    await forbidden(
      logCommunication(viewer, a.contractor, {
        channel: "note",
        occurredOn: "2026-11-01",
        summary: "x",
      }),
    );
    await forbidden(createWarranty(viewer, { coverage: "x", projectId: a.project }));
    await forbidden(createTask(viewer, { title: "x", projectId: a.project }));
    await forbidden(
      uploadDocument(
        viewer,
        { kind: "contractor", id: a.contractor },
        { name: "x.pdf", bytes: PDF },
      ),
    );
  });
});
