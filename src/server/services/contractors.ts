import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  type CommunicationRecord,
  type ContractorDetail,
  type ContractorSummary,
  deleteCommunicationRow,
  deleteContractorRow,
  findContractor,
  insertCommunication,
  insertContractor,
  linkContractorProject,
  listCommunications,
  listContractors,
  listProjectContractors,
  type ProjectContractor,
  unlinkContractorProject,
  updateContractorRow,
} from "@/server/data/contractors";

import { removeFiles } from "./attachments";
import {
  communicationInput,
  CONTRACTOR_STATUS_LABELS,
  contractorInput,
  contractorProjectInput,
  type ContractorStatus,
} from "./contractor-inputs";
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

export type ContractorInput = FormInput<typeof contractorInput>;

export async function getContractors(ctx: WorkspaceContext): Promise<ContractorSummary[]> {
  assertCan(ctx, "records:view");
  return listContractors(ctx);
}

export async function getContractor(ctx: WorkspaceContext, id: string): Promise<ContractorDetail> {
  assertCan(ctx, "records:view");
  const contractor = await findContractor(ctx, id);
  if (!contractor) throw new NotFoundError("contractor");
  return contractor;
}

const NAME_TAKEN = "There's already a contractor with this name.";

export async function createContractor(
  ctx: WorkspaceContext,
  input: ContractorInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { name, ...fields } = contractorInput.parse(input);
  const result = await insertContractor(ctx, name, fields);
  if (result.status === "name_taken") throw fieldError("name", NAME_TAKEN);
  await recordActivity(ctx, {
    action: "contractor.created",
    entityType: "contractor",
    entityId: result.id,
    summary: `Added ${name}`,
  });
  return { id: result.id };
}

export async function updateContractor(
  ctx: WorkspaceContext,
  id: string,
  input: ContractorInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await findContractor(ctx, id);
  if (!before) throw new NotFoundError("contractor");
  const { name, ...fields } = contractorInput.parse(input);
  const result = await updateContractorRow(ctx, id, name, fields);
  if (result === "not_found") throw new NotFoundError("contractor");
  if (result === "name_taken") throw fieldError("name", NAME_TAKEN);
  const statusChanged = before.status !== fields.status;
  await recordActivity(ctx, {
    action: statusChanged ? "contractor.status_changed" : "contractor.updated",
    entityType: "contractor",
    entityId: id,
    summary: statusChanged
      ? `Changed the status to ${CONTRACTOR_STATUS_LABELS[fields.status as ContractorStatus]}`
      : "Updated the details",
  });
}

export async function deleteContractor(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await deleteContractorRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("contractor");
  if (result.status === "has_agreements") throw new RuleError("contractor_has_agreements");
  await removeFiles(ctx, result.fileIds);
}

// --- Projects --------------------------------------------------------------

export async function getProjectContractors(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<ProjectContractor[]> {
  assertCan(ctx, "records:view");
  return listProjectContractors(ctx, projectId);
}

export async function addContractorToProject(
  ctx: WorkspaceContext,
  contractorId: string,
  input: FormInput<typeof contractorProjectInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const { projectId, role } = contractorProjectInput.parse(input);
  if (!(await linkContractorProject(ctx, contractorId, projectId, role))) {
    throw new NotFoundError("contractor or project");
  }
  await recordActivity(ctx, {
    action: "contractor.project_linked",
    entityType: "contractor",
    entityId: contractorId,
    summary: role ? `Added to a project as ${role}` : "Added to a project",
  });
}

export async function removeContractorFromProject(
  ctx: WorkspaceContext,
  contractorId: string,
  projectId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await unlinkContractorProject(ctx, contractorId, projectId))) {
    throw new NotFoundError("contractor on project");
  }
}

// --- Communication log -----------------------------------------------------

export async function getCommunications(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string },
): Promise<CommunicationRecord[]> {
  assertCan(ctx, "records:view");
  return listCommunications(ctx, where);
}

export async function logCommunication(
  ctx: WorkspaceContext,
  contractorId: string,
  input: FormInput<typeof communicationInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = communicationInput.parse(input);
  const created = await insertCommunication(ctx, contractorId, fields);
  if (!created) throw new NotFoundError("contractor or project");
  return created;
}

export async function deleteCommunication(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ contractorId: string }> {
  assertCan(ctx, "records:edit");
  const contractorId = await deleteCommunicationRow(ctx, id);
  if (!contractorId) throw new NotFoundError("communication");
  return { contractorId };
}
