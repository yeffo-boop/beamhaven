"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import { createMilestone, deleteMilestone, updateMilestone } from "@/server/services/milestones";
import { addDependency, removeDependency } from "@/server/services/tasks";

import type { FormResult } from "./account";
import { asFormResult, idFrom, text } from "./helpers";

/** Server Actions for milestones and task dependencies (Milestone 7, part 1). */

const MILESTONE_FIELDS = ["name", "targetDate", "notes"] as const;

function milestoneInput(formData: FormData) {
  return Object.fromEntries(MILESTONE_FIELDS.map((name) => [name, text(formData, name)]));
}

export async function saveMilestoneAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  try {
    if (id) await updateMilestone(ctx, id, milestoneInput(formData));
    else await createMilestone(ctx, idFrom(formData, "projectId"), milestoneInput(formData));
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function deleteMilestoneAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  let projectId: string;
  try {
    ({ projectId } = await deleteMilestone(ctx, idFrom(formData)));
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(`/projects/${projectId}`);
}

export async function addDependencyAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await addDependency(ctx, idFrom(formData, "taskId"), text(formData, "dependsOnId"));
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function removeDependencyAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await removeDependency(ctx, idFrom(formData, "taskId"), idFrom(formData, "dependsOnId"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}
