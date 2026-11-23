"use client";

import { DateField } from "@/components/budget/today-input";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import {
  linkProjectAction,
  logCommunicationAction,
  saveContractorAction,
  saveTaskAction,
  saveWarrantyAction,
} from "@/server/actions/contractors";

import {
  channelOptions,
  contractorStatusOptions,
  priorityOptions,
  taskStatusOptions,
} from "./labels";

export type Choice = { value: string; label: string };

export type ContractorValues = {
  id: string;
  name: string;
  contactName: string;
  trade: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiresOn: string;
  insuranceProvider: string;
  insuranceExpiresOn: string;
  status: string;
  notes: string;
};

/** Adds or edits a contractor. */
export function ContractorForm({
  contractor,
  cancelHref,
}: {
  contractor?: ContractorValues;
  cancelHref: string;
}) {
  const f = useForm(saveContractorAction);
  const value = (name: keyof ContractorValues) => f.typed(name) ?? contractor?.[name] ?? "";
  const text = (name: keyof ContractorValues, label: string, more: object = {}) => (
    <TextField
      id={`contractor-${name}`}
      name={name}
      label={label}
      defaultValue={value(name)}
      error={f.error(name)}
      {...more}
    />
  );
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-6" noValidate>
      {contractor ? <input type="hidden" name="id" value={contractor.id} /> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Who they are</legend>
        {text("name", "Company or name", { placeholder: "Ace Builders", autoComplete: "off" })}
        {text("trade", "Trade (optional)", { placeholder: "General contractor" })}
        {text("contactName", "Contact person (optional)", { autoComplete: "off" })}
        <SelectField
          id="contractor-status"
          name="status"
          label="Status"
          options={contractorStatusOptions}
          defaultValue={value("status") || "active"}
          error={f.error("status")}
        />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">How to reach them</legend>
        {text("phone", "Phone (optional)", { type: "tel", inputMode: "tel", autoComplete: "off" })}
        {text("email", "Email (optional)", { type: "email", autoComplete: "off" })}
        {text("website", "Website (optional)", { inputMode: "url", placeholder: "example.com" })}
        {text("address", "Address (optional)", { autoComplete: "off" })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">License and insurance</legend>
        {text("licenseNumber", "License number (optional)", { autoComplete: "off" })}
        {text("licenseState", "Issued by (optional)", { placeholder: "Oregon CCB" })}
        <DateField
          id="contractor-licenseExpiresOn"
          name="licenseExpiresOn"
          label="License expires (optional)"
          defaultValue={value("licenseExpiresOn")}
          error={f.error("licenseExpiresOn")}
        />
        {text("insuranceProvider", "Insurer (optional)", { autoComplete: "off" })}
        <DateField
          id="contractor-insuranceExpiresOn"
          name="insuranceExpiresOn"
          label="Insurance expires (optional)"
          defaultValue={value("insuranceExpiresOn")}
          error={f.error("insuranceExpiresOn")}
        />
      </fieldset>
      <TextAreaField
        id="contractor-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={contractor ? "Save changes" : "Add contractor"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

/** Puts this contractor on one of the household's projects. */
export function LinkProjectForm({
  contractorId,
  projects,
}: {
  contractorId: string;
  projects: Choice[];
}) {
  const f = useForm(linkProjectAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="contractorId" value={contractorId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="link-project"
          name="projectId"
          label="Project"
          options={projects}
          defaultValue={f.typed("projectId")}
          error={f.error("projectId")}
        />
        <TextField
          id="link-role"
          name="role"
          label="Doing what (optional)"
          placeholder="Electrical"
          defaultValue={f.typed("role")}
          error={f.error("role")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add to project" />
    </form>
  );
}

/** The project picker on the project page itself: the project is fixed. */
export function AddContractorToProjectForm({
  projectId,
  contractors,
}: {
  projectId: string;
  contractors: Choice[];
}) {
  const f = useForm(linkProjectAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="project-contractor"
          name="contractorId"
          label="Contractor"
          options={contractors}
          defaultValue={f.typed("contractorId")}
          error={f.error("contractorId")}
        />
        <TextField
          id="project-contractor-role"
          name="role"
          label="Doing what (optional)"
          placeholder="Electrical"
          defaultValue={f.typed("role")}
          error={f.error("role")}
        />
      </div>
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add to project" />
    </form>
  );
}

/** Adds an entry to a contractor's communication log. */
export function CommunicationForm({
  contractorId,
  projects,
}: {
  contractorId: string;
  projects: Choice[];
}) {
  const f = useForm(logCommunicationAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="contractorId" value={contractorId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="communication-channel"
          name="channel"
          label="How"
          options={channelOptions}
          defaultValue={f.typed("channel") ?? "call"}
          error={f.error("channel")}
        />
        <DateField
          id="communication-date"
          name="occurredOn"
          label="When"
          defaultToday
          defaultValue={f.typed("occurredOn")}
          error={f.error("occurredOn")}
        />
        <SelectField
          id="communication-project"
          name="projectId"
          label="About (optional)"
          options={[{ value: "", label: "No particular project" }, ...projects]}
          defaultValue={f.typed("projectId")}
          error={f.error("projectId")}
        />
      </div>
      <TextAreaField
        id="communication-summary"
        name="summary"
        label="What was said or agreed"
        defaultValue={f.typed("summary")}
        error={f.error("summary")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add to log" />
    </form>
  );
}

export type WarrantyValues = {
  id: string;
  coverage: string;
  provider: string;
  contractorId: string;
  projectId: string;
  roomId: string;
  startsOn: string;
  expiresOn: string;
  notes: string;
};

/**
 * Adds or edits a warranty. `fixed` holds the link the page already knows
 * (a contractor, project or room); the rest can be chosen.
 */
export function WarrantyForm({
  warranty,
  fixed = {},
  contractors,
  projects,
  rooms,
  cancelHref,
}: {
  warranty?: WarrantyValues;
  fixed?: { contractorId?: string; projectId?: string; roomId?: string };
  contractors: Choice[];
  projects: Choice[];
  rooms: Choice[];
  cancelHref?: string;
}) {
  const f = useForm(saveWarrantyAction);
  const value = (name: keyof WarrantyValues) => f.typed(name) ?? warranty?.[name] ?? "";
  const link = (
    name: "contractorId" | "projectId" | "roomId",
    label: string,
    options: Choice[],
    none: string,
  ) =>
    fixed[name] ? (
      <input type="hidden" name={name} value={fixed[name]} />
    ) : (
      <SelectField
        id={`warranty-${name}`}
        name={name}
        label={label}
        options={[{ value: "", label: none }, ...options]}
        defaultValue={value(name)}
        error={f.error(name)}
      />
    );
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {warranty ? <input type="hidden" name="id" value={warranty.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="warranty-coverage"
          name="coverage"
          label="What it covers"
          placeholder="Roof workmanship"
          defaultValue={value("coverage")}
          error={f.error("coverage")}
        />
        <TextField
          id="warranty-provider"
          name="provider"
          label="Provided by (optional)"
          hint="A manufacturer, if it isn't the contractor."
          defaultValue={value("provider")}
          error={f.error("provider")}
        />
        {link("contractorId", "Contractor (optional)", contractors, "No contractor")}
        {link("projectId", "Project (optional)", projects, "No project")}
        {link("roomId", "Room (optional)", rooms, "No room")}
        <DateField
          id="warranty-starts"
          name="startsOn"
          label="Starts (optional)"
          defaultValue={value("startsOn")}
          error={f.error("startsOn")}
        />
        <DateField
          id="warranty-expires"
          name="expiresOn"
          label="Expires (optional)"
          defaultValue={value("expiresOn")}
          error={f.error("expiresOn")}
        />
      </div>
      <TextAreaField
        id="warranty-notes"
        name="notes"
        label="Notes (optional)"
        hint="How to make a claim, the serial number, and so on."
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={warranty ? "Save changes" : "Add warranty"}
        cancelHref={cancelHref}
      />
    </form>
  );
}

export type TaskValues = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  roomId: string;
  status: string;
  priority: string;
  assignee: string;
  dueDate: string;
};

/** Adds or edits a task on a project or room. */
export function TaskForm({
  task,
  fixed = {},
  assignees,
  projects,
  rooms,
  cancelHref,
}: {
  task?: TaskValues;
  fixed?: { projectId?: string; roomId?: string };
  assignees: Choice[];
  projects: Choice[];
  rooms: Choice[];
  cancelHref?: string;
}) {
  const f = useForm(saveTaskAction);
  const value = (name: keyof TaskValues) => f.typed(name) ?? task?.[name] ?? "";
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="task-title"
          name="title"
          label="Task"
          placeholder="Pick the tile"
          defaultValue={value("title")}
          error={f.error("title")}
          className="sm:col-span-2"
        />
        {fixed.projectId ? (
          <input type="hidden" name="projectId" value={fixed.projectId} />
        ) : (
          <SelectField
            id="task-project"
            name="projectId"
            label="Project (optional)"
            options={[{ value: "", label: "No project" }, ...projects]}
            defaultValue={value("projectId")}
            error={f.error("projectId")}
          />
        )}
        {fixed.roomId ? (
          <input type="hidden" name="roomId" value={fixed.roomId} />
        ) : (
          <SelectField
            id="task-room"
            name="roomId"
            label="Room (optional)"
            options={[{ value: "", label: "No particular room" }, ...rooms]}
            defaultValue={value("roomId")}
            error={f.error("roomId")}
          />
        )}
        <SelectField
          id="task-assignee"
          name="assignee"
          label="Assigned to (optional)"
          options={[{ value: "", label: "Nobody yet" }, ...assignees]}
          defaultValue={value("assignee")}
          error={f.error("assignee")}
        />
        <DateField
          id="task-due"
          name="dueDate"
          label="Due (optional)"
          defaultValue={value("dueDate")}
          error={f.error("dueDate")}
        />
        {task ? (
          <SelectField
            id="task-status"
            name="status"
            label="Status"
            options={taskStatusOptions}
            defaultValue={value("status")}
            error={f.error("status")}
          />
        ) : null}
        <SelectField
          id="task-priority"
          name="priority"
          label="Priority"
          options={priorityOptions}
          defaultValue={value("priority") || "normal"}
          error={f.error("priority")}
        />
      </div>
      <TextAreaField
        id="task-description"
        name="description"
        label="Details (optional)"
        defaultValue={value("description")}
        error={f.error("description")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={task ? "Save changes" : "Add task"}
        cancelHref={cancelHref}
      />
    </form>
  );
}
