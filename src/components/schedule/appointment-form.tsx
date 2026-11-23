"use client";

import { useState } from "react";

import { DateField } from "@/components/budget/today-input";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { saveAppointmentAction } from "@/server/actions/appointments";

type Choice = { value: string; label: string };

export type AppointmentValues = {
  id: string;
  title: string;
  kind: string;
  day: string;
  startTime: string;
  endTime: string;
  location: string;
  projectId: string;
  roomId: string;
  contractorId: string;
  outcome: string;
  notes: string;
};

const KINDS: Choice[] = [
  { value: "appointment", label: "Appointment or visit" },
  { value: "inspection", label: "Inspection" },
  { value: "delivery", label: "Delivery" },
  { value: "other", label: "Something else" },
];

/** Puts an appointment, inspection or delivery on the calendar, or changes one. */
export function AppointmentForm({
  appointment,
  fixed = {},
  projects,
  rooms,
  contractors,
}: {
  appointment?: AppointmentValues;
  fixed?: { projectId?: string };
  projects: Choice[];
  rooms: Choice[];
  contractors: Choice[];
}) {
  const f = useForm(saveAppointmentAction);
  const value = (name: keyof AppointmentValues) => f.typed(name) ?? appointment?.[name] ?? "";
  const [kind, setKind] = useState(value("kind") || "appointment");
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {appointment ? <input type="hidden" name="id" value={appointment.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="appointment-title"
          name="title"
          label="What"
          placeholder="Electrical rough-in inspection"
          defaultValue={value("title")}
          error={f.error("title")}
          className="sm:col-span-2"
        />
        <SelectField
          id="appointment-kind"
          name="kind"
          label="Kind"
          options={KINDS}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          error={f.error("kind")}
        />
        <DateField
          id="appointment-day"
          name="day"
          label="Day"
          defaultValue={value("day")}
          defaultToday={!appointment}
          error={f.error("day")}
        />
        <TextField
          id="appointment-start"
          name="startTime"
          type="time"
          label="Starts (optional)"
          defaultValue={value("startTime")}
          error={f.error("startTime")}
        />
        <TextField
          id="appointment-end"
          name="endTime"
          type="time"
          label="Ends (optional)"
          defaultValue={value("endTime")}
          error={f.error("endTime")}
        />
        <TextField
          id="appointment-location"
          name="location"
          label="Where (optional)"
          placeholder="Basement"
          defaultValue={value("location")}
          error={f.error("location")}
          className="sm:col-span-2"
        />
        {fixed.projectId ? (
          <input type="hidden" name="projectId" value={fixed.projectId} />
        ) : (
          <SelectField
            id="appointment-project"
            name="projectId"
            label="Project (optional)"
            options={[{ value: "", label: "No project" }, ...projects]}
            defaultValue={value("projectId")}
            error={f.error("projectId")}
          />
        )}
        <SelectField
          id="appointment-room"
          name="roomId"
          label="Room (optional)"
          options={[{ value: "", label: "No particular room" }, ...rooms]}
          defaultValue={value("roomId")}
          error={f.error("roomId")}
        />
        <SelectField
          id="appointment-contractor"
          name="contractorId"
          label="With (optional)"
          options={[{ value: "", label: "No contractor" }, ...contractors]}
          defaultValue={value("contractorId")}
          error={f.error("contractorId")}
        />
        {kind === "inspection" ? (
          <SelectField
            id="appointment-outcome"
            name="outcome"
            label="Result"
            options={[
              { value: "", label: "Not yet" },
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Failed" },
            ]}
            defaultValue={value("outcome")}
            error={f.error("outcome")}
          />
        ) : null}
      </div>
      <TextAreaField
        id="appointment-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={appointment ? "Save changes" : "Add to calendar"}
      />
    </form>
  );
}
