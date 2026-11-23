"use client";

import { useActionState } from "react";

import { inputClass } from "@/components/forms/field";
import { cn } from "@/lib/utils";
import { saveProjectRoomsAction } from "@/server/actions/records";

import { FormFooter } from "./form-footer";

/** Choose which of the property's rooms this project works on, and what's planned in each. */
export function ProjectRoomsForm({
  projectId,
  rooms,
  linked,
}: {
  projectId: string;
  rooms: { id: string; name: string }[];
  linked: { roomId: string; plannedImprovements: string | null }[];
}) {
  const [state, action, pending] = useActionState(saveProjectRoomsAction, { status: "idle" });
  const plans = new Map(linked.map((l) => [l.roomId, l.plannedImprovements ?? ""]));
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={projectId} />
      <ul className="flex flex-col gap-3">
        {rooms.map((room) => (
          <li
            key={room.id}
            className="grid gap-2 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-center"
          >
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="roomId"
                value={room.id}
                defaultChecked={plans.has(room.id)}
                className="size-4 accent-[var(--accent)]"
              />
              {room.name}
            </label>
            <input
              name={`plan-${room.id}`}
              aria-label={`Planned work in ${room.name}`}
              placeholder="Planned work (optional)"
              defaultValue={plans.get(room.id) ?? ""}
              className={cn(inputClass, "h-10 text-sm")}
            />
          </li>
        ))}
      </ul>
      <FormFooter pending={pending} state={state} saveLabel="Save rooms" />
    </form>
  );
}
