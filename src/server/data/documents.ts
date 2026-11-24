import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import type { NewFile } from "./files";
import { newId } from "./ids";

/** The document library (Milestone 8, part 1, ADR-034). */

type Tx = Prisma.TransactionClient;

export type DocumentFields = {
  title: string;
  category: string;
  projectId: string | null;
  roomId: string | null;
  contractorId: string | null;
  notes: string | null;
};

export type VersionRecord = {
  id: string;
  number: number;
  note: string | null;
  createdAt: Date;
  createdByName: string | null;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type DocumentSummary = DocumentFields & {
  id: string;
  projectName: string | null;
  roomName: string | null;
  contractorName: string | null;
  updatedAt: Date;
  versionCount: number;
  /** The newest version. Every document has at least one. */
  current: VersionRecord | null;
};

export type DocumentDetail = DocumentSummary & { versions: VersionRecord[] };

async function linksInHousehold(tx: Tx, ws: string, f: DocumentFields): Promise<boolean> {
  const counts = await Promise.all([
    f.projectId ? tx.project.count({ where: { id: f.projectId, workspaceId: ws } }) : 1,
    f.roomId ? tx.room.count({ where: { id: f.roomId, workspaceId: ws } }) : 1,
    f.contractorId ? tx.contractor.count({ where: { id: f.contractorId, workspaceId: ws } }) : 1,
  ]);
  return counts.every((n) => n === 1);
}

async function insertVersionRows(
  tx: Tx,
  ctx: WorkspaceContext,
  documentId: string,
  number: number,
  file: NewFile,
  note: string | null,
): Promise<void> {
  const fileId = newId();
  await tx.fileObject.create({
    data: { id: fileId, workspaceId: ctx.workspaceId, uploadedById: ctx.userId, ...file },
  });
  await tx.documentVersion.create({
    data: {
      id: newId(),
      workspaceId: ctx.workspaceId,
      documentId,
      number,
      fileId,
      note,
      createdById: ctx.userId,
    },
  });
}

/** A new document with its first version. Null if a link isn't in this household. */
export async function insertDocument(
  ctx: WorkspaceContext,
  fields: DocumentFields,
  file: NewFile,
  note: string | null,
): Promise<{ id: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return null;
    const id = newId();
    await tx.document.create({
      data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
    });
    await insertVersionRows(tx, ctx, id, 1, file, note);
    return { id };
  });
}

/** Adds the next version. Null if the document isn't in this household. */
export async function insertDocumentVersion(
  ctx: WorkspaceContext,
  documentId: string,
  file: NewFile,
  note: string | null,
): Promise<{ number: number; title: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    // Locks the document's row, so two uploads at once get different numbers.
    const locked = await tx.$queryRaw<{ title: string }[]>`
      SELECT title FROM documents
      WHERE id = ${documentId} AND workspace_id = ${ctx.workspaceId}
      FOR UPDATE`;
    const doc = locked[0];
    if (!doc) return null;
    const last = await tx.documentVersion.aggregate({
      where: { documentId, workspaceId: ctx.workspaceId },
      _max: { number: true },
    });
    const number = (last._max.number ?? 0) + 1;
    await insertVersionRows(tx, ctx, documentId, number, file, note);
    await tx.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } });
    return { number, title: doc.title };
  });
}

export async function updateDocumentRow(
  ctx: WorkspaceContext,
  id: string,
  fields: DocumentFields,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    if (!(await linksInHousehold(tx, ctx.workspaceId, fields))) return false;
    const result = await tx.document.updateMany({
      where: { id, workspaceId: ctx.workspaceId },
      data: fields,
    });
    return result.count === 1;
  });
}

/** Deletes a document. Returns its files, for the caller to remove, or null if not found. */
export async function deleteDocumentRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ title: string; fileIds: string[] } | null> {
  return getPrisma().$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { title: true, versions: { select: { fileId: true } } },
    });
    if (!doc) return null;
    await tx.document.delete({ where: { id } });
    return { title: doc.title, fileIds: doc.versions.map((v) => v.fileId) };
  });
}

export type DeleteVersionResult =
  | { status: "deleted"; fileId: string; number: number }
  | { status: "not_found" }
  | { status: "last" };

/** Removes one version, but never the only one left. */
export async function deleteVersionRow(
  ctx: WorkspaceContext,
  documentId: string,
  versionId: string,
): Promise<DeleteVersionResult> {
  return getPrisma().$transaction(async (tx) => {
    const versions = await tx.documentVersion.findMany({
      where: { documentId, workspaceId: ctx.workspaceId },
      select: { id: true, fileId: true, number: true },
    });
    const version = versions.find((v) => v.id === versionId);
    if (!version) return { status: "not_found" };
    if (versions.length === 1) return { status: "last" };
    await tx.documentVersion.delete({ where: { id: versionId } });
    return { status: "deleted", fileId: version.fileId, number: version.number };
  });
}

const versionSelect = {
  id: true,
  number: true,
  note: true,
  createdAt: true,
  createdById: true,
  file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
} as const;

const documentSelect = {
  id: true,
  title: true,
  category: true,
  projectId: true,
  roomId: true,
  contractorId: true,
  notes: true,
  updatedAt: true,
  project: { select: { name: true } },
  room: { select: { name: true } },
  contractor: { select: { vendor: { select: { name: true } } } },
} as const;

type VersionRow = Prisma.DocumentVersionGetPayload<{ select: typeof versionSelect }>;

async function namesFor(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const users = await getPrisma().user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

function toVersion(row: VersionRow, names: Map<string, string>): VersionRecord {
  return {
    id: row.id,
    number: row.number,
    note: row.note,
    createdAt: row.createdAt,
    createdByName: row.createdById ? (names.get(row.createdById) ?? null) : null,
    fileId: row.file.id,
    originalName: row.file.originalName,
    mimeType: row.file.mimeType,
    sizeBytes: row.file.sizeBytes,
  };
}

export type DocumentFilter = {
  q?: string;
  category?: string;
  projectId?: string;
  roomId?: string;
  contractorId?: string;
};

/** The library, newest change first. Searches titles, notes and file names. */
export async function listDocuments(
  ctx: WorkspaceContext,
  filter: DocumentFilter = {},
): Promise<DocumentSummary[]> {
  const q = filter.q?.trim();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const rows = await getPrisma().document.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.roomId ? { roomId: filter.roomId } : {}),
      ...(filter.contractorId ? { contractorId: filter.contractorId } : {}),
      ...(contains
        ? {
            OR: [
              { title: contains },
              { notes: contains },
              { versions: { some: { file: { originalName: contains } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    take: 300,
    select: {
      ...documentSelect,
      versions: { orderBy: { number: "desc" }, take: 1, select: versionSelect },
      _count: { select: { versions: true } },
    },
  });
  const names = await namesFor(rows.flatMap((r) => r.versions.map((v) => v.createdById)));
  return rows.map(({ versions, _count, project, room, contractor, ...row }) => ({
    ...row,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    contractorName: contractor?.vendor.name ?? null,
    versionCount: _count.versions,
    current: versions[0] ? toVersion(versions[0], names) : null,
  }));
}

export async function findDocument(
  ctx: WorkspaceContext,
  id: string,
): Promise<DocumentDetail | null> {
  const row = await getPrisma().document.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      ...documentSelect,
      versions: { orderBy: { number: "desc" }, select: versionSelect },
    },
  });
  if (!row) return null;
  const names = await namesFor(row.versions.map((v) => v.createdById));
  const { versions, project, room, contractor, ...rest } = row;
  const list = versions.map((v) => toVersion(v, names));
  return {
    ...rest,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    contractorName: contractor?.vendor.name ?? null,
    versionCount: list.length,
    current: list[0] ?? null,
    versions: list,
  };
}

export type OtherFile = {
  fileId: string;
  originalName: string;
  mimeType: string;
  caption: string | null;
  createdAt: Date;
  /** "Receipt", "Contractor", ...: where the file is kept. */
  place: string;
  placeName: string;
  href: string;
};

/**
 * Receipts and documents kept on other records (expenses, contractors,
 * quotes...), so a search in the library finds them too.
 */
export async function listOtherFiles(ctx: WorkspaceContext, q: string): Promise<OtherFile[]> {
  const contains = { contains: q.trim(), mode: "insensitive" as const };
  const rows = await getPrisma().attachment.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      purpose: { in: ["document", "receipt"] },
      OR: [{ caption: contains }, { file: { originalName: contains } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      fileId: true,
      caption: true,
      createdAt: true,
      file: { select: { originalName: true, mimeType: true } },
      expense: { select: { id: true, description: true } },
      contractor: { select: { id: true, vendor: { select: { name: true } } } },
      warranty: { select: { id: true, coverage: true } },
      quote: { select: { id: true, title: true } },
      contract: { select: { id: true, title: true } },
      material: { select: { id: true, name: true } },
      order: { select: { id: true } },
    },
  });
  return rows.flatMap((r) => {
    const base = {
      fileId: r.fileId,
      originalName: r.file.originalName,
      mimeType: r.file.mimeType,
      caption: r.caption,
      createdAt: r.createdAt,
    };
    const at = (place: string, placeName: string, href: string) => [
      { ...base, place, placeName, href },
    ];
    if (r.expense) return at("Receipt", r.expense.description, `/budget/expenses/${r.expense.id}`);
    if (r.contractor) {
      return at("Contractor", r.contractor.vendor.name, `/contractors/${r.contractor.id}`);
    }
    if (r.warranty) return at("Warranty", r.warranty.coverage, `/warranties/${r.warranty.id}`);
    if (r.quote) return at("Quote", r.quote.title, `/quotes/${r.quote.id}`);
    if (r.contract) return at("Contract", r.contract.title, `/contracts/${r.contract.id}`);
    if (r.material) return at("Material", r.material.name, `/materials/${r.material.id}`);
    if (r.order) return at("Order", "Order", `/orders/${r.order.id}`);
    return [];
  });
}
