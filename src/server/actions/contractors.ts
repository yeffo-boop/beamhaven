"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  addContractorToProject,
  createContractor,
  deleteCommunication,
  deleteContractor,
  logCommunication,
  removeContractorFromProject,
  updateContractor,
} from "@/server/services/contractors";
import {
  changeTaskStatus,
  createTask,
  createWarranty,
  deleteTask,
  deleteWarranty,
  getTask,
  getWarranty,
  updateTask,
  updateWarranty,
} from "@/server/services/tasks";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/**
 * Server Actions for contractors, the communication log, warranties and
 * tasks. They read the form and call a service, which checks the role and
 * validates everything.
 */

const saved = (): FormResult => {
  refresh();
  return { status: "saved" };
};

function fields(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

// --- Contractors -----------------------------------------------------------

const CONTRACTOR_FIELDS = [
  "name",
  "contactName",
  "trade",
  "phone",
  "email",
  "website",
  "address",
  "licenseNumber",
  "licenseState",
  "licenseExpiresOn",
  "insuranceProvider",
  "insuranceExpiresOn",
  "status",
  "notes",
] as const;

export async function saveContractorAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  let id = text(formData, "id");
  try {
    const input = fields(formData, CONTRACTOR_FIELDS);
    if (id) await updateContractor(ctx, id, input);
    else id = (await createContractor(ctx, input)).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/contractors/${id}`);
}

export async function deleteContractorAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  try {
    await deleteContractor(ctx, id);
  } catch (error) {
    problemRedirect(`/contractors/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect("/contractors");
}

export async function linkProjectAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addContractorToProject(
      ctx,
      idFrom(formData, "contractorId"),
      fields(formData, ["projectId", "role"]),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function unlinkProjectAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await removeContractorFromProject(
      ctx,
      idFrom(formData, "contractorId"),
      idFrom(formData, "projectId"),
    );
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

// --- Communication log -----------------------------------------------------

export async function logCommunicationAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await logCommunication(
      ctx,
      idFrom(formData, "contractorId"),
      fields(formData, ["channel", "occurredOn", "projectId", "summary"]),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deleteCommunicationAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deleteCommunication(ctx, idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

// --- Warranties ------------------------------------------------------------

const WARRANTY_FIELDS = [
  "coverage",
  "provider",
  "contractorId",
  "projectId",
  "roomId",
  "materialId",
  "startsOn",
  "expiresOn",
  "notes",
] as const;

/** Where a warranty or task "lives", for going back after a change. */
function homeOf(record: {
  projectId: string | null;
  roomId: string | null;
  contractorId?: string | null;
  materialId?: string | null;
}): string {
  if (record.materialId) return `/materials/${record.materialId}`;
  if (record.projectId) return `/projects/${record.projectId}`;
  if (record.roomId) return `/rooms/${record.roomId}`;
  if (record.contractorId) return `/contractors/${record.contractorId}`;
  return "/contractors";
}

export async function saveWarrantyAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  try {
    const input = fields(formData, WARRANTY_FIELDS);
    if (id) await updateWarranty(ctx, id, input);
    else await createWarranty(ctx, input);
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function deleteWarrantyAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let back: string;
  try {
    back = homeOf(await getWarranty(ctx, id));
    await deleteWarranty(ctx, id);
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(back);
}

// --- Tasks -----------------------------------------------------------------

const TASK_FIELDS = [
  "title",
  "description",
  "projectId",
  "roomId",
  "status",
  "priority",
  "assignee",
  "dueDate",
  "milestoneId",
] as const;

export async function saveTaskAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  try {
    const input = fields(formData, TASK_FIELDS);
    if (id) await updateTask(ctx, id, input);
    else await createTask(ctx, input);
  } catch (error) {
    return asFormResult(error, formData);
  }
  return saved();
}

export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await changeTaskStatus(ctx, idFrom(formData), text(formData, "status"));
  } catch (error) {
    // A blocked task: its own page says what it waits on.
    problemRedirect(`/tasks/${idFrom(formData)}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let back: string;
  try {
    back = homeOf(await getTask(ctx, id));
    await deleteTask(ctx, id);
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(back);
}
