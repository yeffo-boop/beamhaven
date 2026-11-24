import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { userNames } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

// --- Contractors -----------------------------------------------------------

export type ContractorFields = {
  contactName: string | null;
  trade: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpiresOn: Date | null;
  insuranceProvider: string | null;
  insuranceExpiresOn: Date | null;
  status: string;
  notes: string | null;
};

export type ContractorSummary = {
  id: string;
  vendorId: string;
  name: string;
  contactName: string | null;
  trade: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  licenseExpiresOn: Date | null;
  insuranceExpiresOn: Date | null;
  projectCount: number;
};

export type ContractorDetail = ContractorSummary &
  ContractorFields & {
    projects: { projectId: string; projectName: string; role: string | null }[];
  };

const summarySelect = {
  id: true,
  vendorId: true,
  contactName: true,
  trade: true,
  phone: true,
  email: true,
  status: true,
  licenseExpiresOn: true,
  insuranceExpiresOn: true,
  vendor: { select: { name: true } },
  _count: { select: { projects: true } },
} as const;

type SummaryRow = Prisma.ContractorGetPayload<{ select: typeof summarySelect }>;

function toSummary({ vendor, _count, ...row }: SummaryRow): ContractorSummary {
  return { ...row, name: vendor.name, projectCount: _count.projects };
}

export async function listContractors(ctx: WorkspaceContext): Promise<ContractorSummary[]> {
  const rows = await getPrisma().contractor.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: summarySelect,
    orderBy: { vendor: { name: "asc" } },
  });
  return rows.map(toSummary);
}

export async function findContractor(
  ctx: WorkspaceContext,
  id: string,
): Promise<ContractorDetail | null> {
  const row = await getPrisma().contractor.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      ...summarySelect,
      website: true,
      address: true,
      licenseNumber: true,
      licenseState: true,
      insuranceProvider: true,
      notes: true,
      projects: {
        select: { projectId: true, role: true, project: { select: { name: true } } },
        orderBy: { project: { name: "asc" } },
      },
    },
  });
  if (!row) return null;
  const { projects, website, address, licenseNumber, licenseState, insuranceProvider, notes } = row;
  return {
    ...toSummary(row),
    website,
    address,
    licenseNumber,
    licenseState,
    insuranceProvider,
    notes,
    projects: projects.map((p) => ({
      projectId: p.projectId,
      projectName: p.project.name,
      role: p.role,
    })),
  };
}

type Tx = Prisma.TransactionClient;

function sameName(ctx: WorkspaceContext, name: string) {
  return { workspaceId: ctx.workspaceId, name: { equals: name, mode: "insensitive" as const } };
}

/**
 * Adds a contractor. A shop or supplier with the same name already in the
 * budget becomes this contractor (so its bills show up here); one that is
 * already a contractor is refused.
 */
export async function insertContractor(
  ctx: WorkspaceContext,
  name: string,
  fields: ContractorFields,
): Promise<{ status: "saved"; id: string } | { status: "name_taken" }> {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.vendor.findFirst({
      where: sameName(ctx, name),
      select: { id: true, contractor: { select: { id: true } } },
    });
    if (existing?.contractor) return { status: "name_taken" };
    let vendorId = existing?.id;
    if (vendorId) {
      await tx.vendor.update({ where: { id: vendorId }, data: { kind: "contractor" } });
    } else {
      vendorId = newId();
      await tx.vendor.create({
        data: { id: vendorId, workspaceId: ctx.workspaceId, name, kind: "contractor" },
      });
    }
    const id = newId();
    await tx.contractor.create({
      data: { id, workspaceId: ctx.workspaceId, vendorId, createdById: ctx.userId, ...fields },
    });
    return { status: "saved", id };
  });
}

export async function updateContractorRow(
  ctx: WorkspaceContext,
  id: string,
  name: string,
  fields: ContractorFields,
): Promise<"saved" | "not_found" | "name_taken"> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.contractor.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { vendorId: true },
    });
    if (!row) return "not_found";
    const clash = await tx.vendor.count({
      where: { ...sameName(ctx, name), id: { not: row.vendorId } },
    });
    if (clash > 0) return "name_taken";
    await tx.vendor.update({ where: { id: row.vendorId }, data: { name } });
    await tx.contractor.update({ where: { id }, data: fields });
    return "saved";
  });
}

/**
 * Deletes a contractor with its log, project links and documents. Its
 * warranties stay on their project or room (or go, if that was all they
 * were linked to), its tasks become unassigned, and the shop-or-supplier
 * record stays, because bills in the budget may name it.
 */
export async function deleteContractorRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<
  { status: "deleted"; fileIds: string[] } | { status: "not_found" } | { status: "has_agreements" }
> {
  return getPrisma().$transaction(async (tx) => {
    const ws = ctx.workspaceId;
    const row = await tx.contractor.findFirst({
      where: { id, workspaceId: ws },
      select: { vendorId: true, _count: { select: { quotes: true, contracts: true } } },
    });
    if (!row) return { status: "not_found" };
    if (row._count.quotes + row._count.contracts > 0) return { status: "has_agreements" };
    const fileIds = await unlinkWarranties(tx, ws, { contractorId: id });
    await tx.task.updateMany({
      where: { workspaceId: ws, assigneeContractorId: id },
      data: { assigneeContractorId: null },
    });
    // Appointments with them stay on the calendar.
    await tx.appointment.updateMany({
      where: { workspaceId: ws, contractorId: id },
      data: { contractorId: null },
    });
    // So do their documents in the library.
    await tx.document.updateMany({
      where: { workspaceId: ws, contractorId: id },
      data: { contractorId: null },
    });
    const attachments = await tx.attachment.findMany({
      where: { workspaceId: ws, contractorId: id },
      select: { fileId: true },
    });
    await tx.contractor.delete({ where: { id } });
    await tx.vendor.update({ where: { id: row.vendorId }, data: { kind: "other" } });
    return { status: "deleted", fileIds: [...fileIds, ...attachments.map((a) => a.fileId)] };
  });
}

/**
 * Before a contractor, project or room is deleted: its warranties lose the
 * link, and any warranty left with no link at all is deleted (a database
 * check needs at least one). Returns the deleted warranties' files.
 */
export async function unlinkWarranties(
  tx: Tx,
  workspaceId: string,
  link:
    { contractorId: string } | { projectId: string } | { roomId: string } | { materialId: string },
): Promise<string[]> {
  const key = Object.keys(link)[0] as "contractorId" | "projectId" | "roomId" | "materialId";
  const others = (["contractorId", "projectId", "roomId", "materialId"] as const).filter(
    (k) => k !== key,
  );
  const orphans = await tx.warranty.findMany({
    where: { workspaceId, ...link, AND: others.map((k) => ({ [k]: null })) },
    select: { id: true, attachments: { select: { fileId: true } } },
  });
  if (orphans.length > 0) {
    await tx.warranty.deleteMany({
      where: { workspaceId, id: { in: orphans.map((w) => w.id) } },
    });
  }
  await tx.warranty.updateMany({ where: { workspaceId, ...link }, data: { [key]: null } });
  return orphans.flatMap((w) => w.attachments.map((a) => a.fileId));
}

/**
 * Before a project or room is deleted: its log entries, tasks and materials
 * let go of it. Materials stay in the household (they're still real things
 * you may have bought); only the link goes.
 */
export async function unlinkProjectOrRoom(
  tx: Tx,
  workspaceId: string,
  link: { projectId: string } | { roomId: string },
): Promise<string[]> {
  const fileIds = await unlinkWarranties(tx, workspaceId, link);
  // Appointments stay on the calendar, without the link.
  await tx.appointment.updateMany({
    where: { workspaceId, ...link },
    data: "projectId" in link ? { projectId: null } : { roomId: null },
  });
  await tx.material.updateMany({
    where: { workspaceId, ...link },
    data: "projectId" in link ? { projectId: null } : { roomId: null },
  });
  // Library documents stay in the library.
  await tx.document.updateMany({
    where: { workspaceId, ...link },
    data: "projectId" in link ? { projectId: null } : { roomId: null },
  });
  // So do design boards.
  await tx.designBoard.updateMany({
    where: { workspaceId, ...link },
    data: "projectId" in link ? { projectId: null } : { roomId: null },
  });
  if ("projectId" in link) {
    await tx.communication.updateMany({
      where: { workspaceId, projectId: link.projectId },
      data: { projectId: null },
    });
    // Tasks that are only on this project go with it; ones also on a room stay there.
    await tx.task.deleteMany({ where: { workspaceId, projectId: link.projectId, roomId: null } });
    // Its milestones go with the project, so they come off the task too.
    await tx.task.updateMany({
      where: { workspaceId, projectId: link.projectId },
      data: { projectId: null, milestoneId: null },
    });
  } else {
    await tx.task.deleteMany({ where: { workspaceId, roomId: link.roomId, projectId: null } });
    await tx.task.updateMany({
      where: { workspaceId, roomId: link.roomId },
      data: { roomId: null },
    });
  }
  return fileIds;
}

// --- Contractors on projects ----------------------------------------------

export type ProjectContractor = {
  contractorId: string;
  name: string;
  trade: string | null;
  role: string | null;
  status: string;
};

export async function listProjectContractors(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<ProjectContractor[]> {
  const rows = await getPrisma().contractorProject.findMany({
    where: { workspaceId: ctx.workspaceId, projectId },
    select: {
      contractorId: true,
      role: true,
      contractor: { select: { trade: true, status: true, vendor: { select: { name: true } } } },
    },
    orderBy: { contractor: { vendor: { name: "asc" } } },
  });
  return rows.map((r) => ({
    contractorId: r.contractorId,
    name: r.contractor.vendor.name,
    trade: r.contractor.trade,
    role: r.role,
    status: r.contractor.status,
  }));
}

/** Adds the contractor to the project, or changes their role on it. */
export async function linkContractorProject(
  ctx: WorkspaceContext,
  contractorId: string,
  projectId: string,
  role: string | null,
): Promise<boolean> {
  const ws = ctx.workspaceId;
  const prisma = getPrisma();
  const [contractor, project] = await Promise.all([
    prisma.contractor.count({ where: { id: contractorId, workspaceId: ws } }),
    prisma.project.count({ where: { id: projectId, workspaceId: ws } }),
  ]);
  if (contractor !== 1 || project !== 1) return false;
  await prisma.contractorProject.upsert({
    where: { contractorId_projectId: { contractorId, projectId } },
    create: { workspaceId: ws, contractorId, projectId, role },
    update: { role },
  });
  return true;
}

export async function unlinkContractorProject(
  ctx: WorkspaceContext,
  contractorId: string,
  projectId: string,
): Promise<boolean> {
  const result = await getPrisma().contractorProject.deleteMany({
    where: { workspaceId: ctx.workspaceId, contractorId, projectId },
  });
  return result.count === 1;
}

// --- Communication log -----------------------------------------------------

export type CommunicationFields = {
  channel: string;
  occurredOn: Date;
  projectId: string | null;
  summary: string;
};

export type CommunicationRecord = CommunicationFields & {
  id: string;
  contractorId: string;
  contractorName: string;
  projectName: string | null;
  createdByName: string | null;
};

export async function insertCommunication(
  ctx: WorkspaceContext,
  contractorId: string,
  fields: CommunicationFields,
): Promise<{ id: string } | null> {
  const ws = ctx.workspaceId;
  const prisma = getPrisma();
  if ((await prisma.contractor.count({ where: { id: contractorId, workspaceId: ws } })) !== 1) {
    return null;
  }
  if (
    fields.projectId &&
    (await prisma.project.count({ where: { id: fields.projectId, workspaceId: ws } })) !== 1
  ) {
    return null;
  }
  const id = newId();
  await prisma.communication.create({
    data: { id, workspaceId: ws, contractorId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

export async function listCommunications(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string },
  limit = 100,
): Promise<CommunicationRecord[]> {
  const rows = await getPrisma().communication.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      contractorId: true,
      channel: true,
      occurredOn: true,
      projectId: true,
      summary: true,
      createdById: true,
      contractor: { select: { vendor: { select: { name: true } } } },
      project: { select: { name: true } },
    },
  });
  const names = await userNames(rows.map((r) => r.createdById));
  return rows.map(({ contractor, project, createdById, ...row }) => ({
    ...row,
    contractorName: contractor.vendor.name,
    projectName: project?.name ?? null,
    createdByName: createdById ? (names.get(createdById) ?? null) : null,
  }));
}

/** Returns the contractor it belonged to, or null if it wasn't found here. */
export async function deleteCommunicationRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<string | null> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.communication.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { contractorId: true },
    });
    if (!row) return null;
    await tx.communication.delete({ where: { id } });
    return row.contractorId;
  });
}
