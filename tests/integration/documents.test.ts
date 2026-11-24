import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import {
  readFileForDownload,
  uploadDocument,
  UploadError,
  uploadReceipt,
} from "@/server/services/attachments";
import { createLine, getCategories } from "@/server/services/budget";
import { createContractor, deleteContractor } from "@/server/services/contractors";
import {
  addDocumentVersion,
  createLibraryDocument,
  deleteDocumentVersion,
  deleteLibraryDocument,
  getDocumentLibrary,
  getLibraryDocument,
  searchOtherFiles,
  updateLibraryDocument,
} from "@/server/services/documents";
import { NotFoundError, RuleError } from "@/server/services/errors";
import { createExpense } from "@/server/services/expenses";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom, deleteRoom } from "@/server/services/rooms";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);

const PDF = new TextEncoder().encode("%PDF-1.7\n%plan\n");
const PDF2 = new TextEncoder().encode("%PDF-1.7\n%revised plan\n");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const fields = (over: Record<string, string> = {}) => ({
  title: "Kitchen floor plan",
  category: "plan",
  projectId: "",
  roomId: "",
  contractorId: "",
  notes: "",
  ...over,
});

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
  const contractor = (await createContractor(ctx, { name: `${name} Design`, status: "active" })).id;
  return { user, workspaceId, ctx, property, room, project, contractor };
}

describe("document library", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("adds a document with its first version and links", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(
      a.ctx,
      fields({ projectId: a.project, roomId: a.room, contractorId: a.contractor, notes: "v1" }),
      { name: "../plans/floor plan.pdf", bytes: PDF },
      "From the designer",
    );
    const doc = await getLibraryDocument(a.ctx, id);
    expect(doc).toMatchObject({
      title: "Kitchen floor plan",
      category: "plan",
      projectName: "Kitchen",
      roomName: "Kitchen",
      contractorName: "Ana Design",
      versionCount: 1,
      notes: "v1",
    });
    expect(doc.current).toMatchObject({
      number: 1,
      note: "From the designer",
      originalName: "floor plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      createdByName: "Ana",
    });
    const { bytes } = await readFileForDownload(a.ctx, doc.current?.fileId ?? "");
    expect(Buffer.from(bytes).equals(Buffer.from(PDF))).toBe(true);
  });

  it("refuses files that aren't a photo or a PDF, and bad fields", async () => {
    const a = await household("Ana");
    await expect(
      createLibraryDocument(a.ctx, fields(), { name: "plan.html", bytes: HTML }),
    ).rejects.toBeInstanceOf(UploadError);
    await expect(
      createLibraryDocument(a.ctx, fields({ title: " " }), { name: "p.pdf", bytes: PDF }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      createLibraryDocument(a.ctx, fields({ category: "secret" }), { name: "p.pdf", bytes: PDF }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await getDocumentLibrary(a.ctx)).toEqual([]);
  });

  it("keeps every version, newest current, and won't remove the last one", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(a.ctx, fields(), { name: "v1.pdf", bytes: PDF });
    expect(
      await addDocumentVersion(a.ctx, id, { name: "v2.pdf", bytes: PDF2 }, "Inspector's notes"),
    ).toEqual({ number: 2 });

    const doc = await getLibraryDocument(a.ctx, id);
    expect(doc.versions.map((v) => [v.number, v.originalName])).toEqual([
      [2, "v2.pdf"],
      [1, "v1.pdf"],
    ]);
    expect(doc.current?.note).toBe("Inspector's notes");
    const [listed] = await getDocumentLibrary(a.ctx);
    expect(listed).toMatchObject({ versionCount: 2, current: { number: 2 } });

    // Removing version 2 deletes its file; version 1 is current again.
    const v2 = doc.versions[0];
    const v1 = doc.versions[1];
    if (!v1 || !v2) throw new Error("setup failed");
    await deleteDocumentVersion(a.ctx, id, v2.id);
    await notFound(readFileForDownload(a.ctx, v2.fileId));
    expect((await getLibraryDocument(a.ctx, id)).current?.number).toBe(1);

    const last = deleteDocumentVersion(a.ctx, id, v1.id);
    await expect(last).rejects.toBeInstanceOf(RuleError);
    await expect(last).rejects.toMatchObject({ code: "document_last_version" });

    // Numbers keep going up: a new upload after a removal is version 2 again
    // only because the highest left is 1.
    expect(await addDocumentVersion(a.ctx, id, { name: "v3.pdf", bytes: PDF2 })).toEqual({
      number: 2,
    });
  });

  it("gives uploads made at the same time different numbers", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(a.ctx, fields(), { name: "v1.pdf", bytes: PDF });
    const added = await Promise.all(
      [1, 2, 3].map((n) => addDocumentVersion(a.ctx, id, { name: `v${n}.pdf`, bytes: PDF2 })),
    );
    expect(added.map((r) => r.number).sort()).toEqual([2, 3, 4]);
  });

  it("edits a document and deletes it with all its files", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(a.ctx, fields(), { name: "v1.pdf", bytes: PDF });
    await addDocumentVersion(a.ctx, id, { name: "v2.pdf", bytes: PDF2 });
    await updateLibraryDocument(
      a.ctx,
      id,
      fields({ title: "Permit", category: "permit", projectId: a.project }),
    );
    expect(await getLibraryDocument(a.ctx, id)).toMatchObject({
      title: "Permit",
      category: "permit",
      projectId: a.project,
    });
    const fileIds = (await getLibraryDocument(a.ctx, id)).versions.map((v) => v.fileId);

    await deleteLibraryDocument(a.ctx, id);
    await notFound(getLibraryDocument(a.ctx, id));
    for (const fileId of fileIds) await notFound(readFileForDownload(a.ctx, fileId));
  });

  it("keeps the document when its project, room or contractor is deleted", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(
      a.ctx,
      fields({ projectId: a.project, roomId: a.room, contractorId: a.contractor }),
      { name: "p.pdf", bytes: PDF },
    );
    await deleteContractor(a.ctx, a.contractor);
    await deleteProject(a.ctx, a.project);
    await deleteRoom(a.ctx, a.room);
    expect(await getLibraryDocument(a.ctx, id)).toMatchObject({
      projectId: null,
      roomId: null,
      contractorId: null,
      versionCount: 1,
    });
  });

  it("filters and searches titles, notes and file names", async () => {
    const a = await household("Ana");
    await createLibraryDocument(a.ctx, fields({ projectId: a.project }), {
      name: "kitchen-layout.pdf",
      bytes: PDF,
    });
    await createLibraryDocument(
      a.ctx,
      fields({ title: "Building permit", category: "permit", notes: "Permit number BP-4471" }),
      { name: "scan.pdf", bytes: PDF },
    );
    const titles = async (filter: Parameters<typeof getDocumentLibrary>[1]) =>
      (await getDocumentLibrary(a.ctx, filter)).map((d) => d.title).sort();

    expect(await titles({})).toEqual(["Building permit", "Kitchen floor plan"]);
    expect(await titles({ category: "permit" })).toEqual(["Building permit"]);
    expect(await titles({ projectId: a.project })).toEqual(["Kitchen floor plan"]);
    expect(await titles({ q: "bp-4471" })).toEqual(["Building permit"]);
    expect(await titles({ q: "LAYOUT" })).toEqual(["Kitchen floor plan"]);
    expect(await titles({ q: "nothing like it" })).toEqual([]);
  });

  it("finds receipts and documents on other records too", async () => {
    const a = await household("Ana");
    await uploadDocument(
      a.ctx,
      { kind: "contractor", id: a.contractor },
      { name: "liability-insurance.pdf", bytes: PDF, caption: "Insurance certificate" },
    );
    const categories = await getCategories(a.ctx);
    const line = (
      await createLine(a.ctx, {
        projectId: a.project,
        categoryId: categories.find((c) => c.name === "Materials")?.id ?? "",
        planned: "500",
      })
    ).id;
    const expense = (
      await createExpense(a.ctx, {
        description: "Tile",
        total: "200",
        expenseDate: "2026-11-20",
        allocations: [{ lineId: line, amount: "", kind: "item" }],
      })
    ).id;
    await uploadReceipt(a.ctx, expense, { name: "tile-insurance-receipt.pdf", bytes: PDF });

    const found = await searchOtherFiles(a.ctx, "insurance");
    expect(found.map((f) => [f.place, f.placeName, f.href]).sort()).toEqual([
      ["Contractor", "Ana Design", `/contractors/${a.contractor}`],
      ["Receipt", "Tile", `/budget/expenses/${expense}`],
    ]);
    expect(await searchOtherFiles(a.ctx, "  ")).toEqual([]);
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const { id } = await createLibraryDocument(a.ctx, fields(), { name: "p.pdf", bytes: PDF });
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);

    expect((await getDocumentLibrary(viewer)).map((d) => d.id)).toEqual([id]);
    expect((await getLibraryDocument(viewer, id)).versionCount).toBe(1);
    await forbidden(createLibraryDocument(viewer, fields(), { name: "p.pdf", bytes: PDF }));
    await forbidden(addDocumentVersion(viewer, id, { name: "p.pdf", bytes: PDF }));
    await forbidden(updateLibraryDocument(viewer, id, fields({ title: "Mine" })));
    await forbidden(deleteLibraryDocument(viewer, id));
    const version = (await getLibraryDocument(a.ctx, id)).versions[0];
    await forbidden(deleteDocumentVersion(viewer, id, version?.id ?? ""));
  });
});

describe("document library isolation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps each household's documents to itself", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const { id } = await createLibraryDocument(b.ctx, fields({ title: "Ben's plan" }), {
      name: "ben.pdf",
      bytes: PDF,
    });
    const bDoc = await getLibraryDocument(b.ctx, id);
    const bVersion = bDoc.versions[0];
    if (!bVersion) throw new Error("setup failed");

    expect(await getDocumentLibrary(a.ctx)).toEqual([]);
    expect(await getDocumentLibrary(a.ctx, { q: "Ben" })).toEqual([]);
    await notFound(getLibraryDocument(a.ctx, id));
    await notFound(readFileForDownload(a.ctx, bVersion.fileId));
    await notFound(addDocumentVersion(a.ctx, id, { name: "x.pdf", bytes: PDF }));
    await notFound(updateLibraryDocument(a.ctx, id, fields({ title: "Taken" })));
    await notFound(deleteLibraryDocument(a.ctx, id));
    await notFound(deleteDocumentVersion(a.ctx, id, bVersion.id));
    // Ben's document is untouched.
    expect(await getLibraryDocument(b.ctx, id)).toMatchObject({
      title: "Ben's plan",
      versionCount: 1,
    });
  });

  it("won't link a document to another household's project, room or contractor", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    for (const link of <Record<string, string>[]>[
      { projectId: b.project },
      { roomId: b.room },
      { contractorId: b.contractor },
    ]) {
      await notFound(createLibraryDocument(a.ctx, fields(link), { name: "p.pdf", bytes: PDF }));
    }
    const { id } = await createLibraryDocument(a.ctx, fields(), { name: "p.pdf", bytes: PDF });
    await notFound(updateLibraryDocument(a.ctx, id, fields({ projectId: b.project })));
    expect(await getDocumentLibrary(a.ctx)).toHaveLength(1);
  });

  it("doesn't show another household's files in the search of other records", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    await uploadDocument(
      b.ctx,
      { kind: "contractor", id: b.contractor },
      { name: "insurance.pdf", bytes: PDF },
    );
    expect(await searchOtherFiles(a.ctx, "insurance")).toEqual([]);
    expect(await searchOtherFiles(b.ctx, "insurance")).toHaveLength(1);
  });
});
