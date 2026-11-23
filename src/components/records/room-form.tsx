"use client";

import { useActionState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { formatLength, type MeasurementSystem } from "@/lib/units";
import { saveRoomAction } from "@/server/actions/records";
import type { RoomSummary } from "@/server/data/rooms";
import { ROOM_TYPES } from "@/server/services/inputs";

import { FormFooter } from "./form-footer";
import { roomTypeLabel } from "./room-labels";

export function lengthHint(system: MeasurementSystem): string {
  return system === "metric"
    ? "For example 3.76 m or 376 cm. Feet and inches work too."
    : `For example 12' 4" or 12' 4 1/2". Metric works too.`;
}

/** Shows a stored length back in the unit it was typed in. */
function lengthValue(mm: number | null, unit: string): string {
  return mm ? formatLength(mm, unit === "metric" ? "metric" : "imperial") : "";
}

/** Creates a room, or edits one when `room` is given. */
export function RoomForm({
  room,
  properties,
  system,
}: {
  room?: RoomSummary;
  properties: { id: string; name: string }[];
  system: MeasurementSystem;
}) {
  const [state, action, pending] = useActionState(saveRoomAction, { status: "idle" });
  const error = (name: string) => state.fields?.[name];
  const typed = (name: string) => state.values?.[name];
  const onlyProperty = properties.length === 1 ? properties[0] : undefined;
  const unit = room?.enteredUnit ?? system;
  const placeholder = system === "metric" ? "3.76 m" : `12' 4"`;
  return (
    <form key={state.attempt} action={action} className="flex flex-col gap-4" noValidate>
      {room ? <input type="hidden" name="id" value={room.id} /> : null}
      {room ? (
        <input type="hidden" name="propertyId" value={room.propertyId} />
      ) : onlyProperty ? (
        <input type="hidden" name="propertyId" value={onlyProperty.id} />
      ) : (
        <SelectField
          id="room-property"
          name="propertyId"
          defaultValue={typed("propertyId")}
          label="Property"
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
          error={error("propertyId")}
          className="sm:max-w-md"
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="room-name"
          name="name"
          label="Room name"
          hint="For example “Main bathroom” or “Back yard”."
          defaultValue={typed("name") ?? room?.name ?? ""}
          required
          error={error("name")}
        />
        <SelectField
          id="room-type"
          name="type"
          label="Type"
          options={ROOM_TYPES.map((value) => ({ value, label: roomTypeLabel(value) }))}
          defaultValue={typed("type") ?? room?.type ?? "other"}
          error={error("type")}
        />
        <TextField
          id="room-floor"
          name="floorLevel"
          label="Floor (optional)"
          hint="For example “Main”, “Upstairs” or “Basement”."
          defaultValue={typed("floorLevel") ?? room?.floorLevel ?? ""}
          error={error("floorLevel")}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Size (optional)</legend>
        <p className="text-xs text-muted-foreground">{lengthHint(system)}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="room-length"
            name="length"
            label="Length"
            inputMode="text"
            placeholder={placeholder}
            defaultValue={typed("length") ?? lengthValue(room?.lengthMm ?? null, unit)}
            error={error("length")}
          />
          <TextField
            id="room-width"
            name="width"
            label="Width"
            placeholder={placeholder}
            defaultValue={typed("width") ?? lengthValue(room?.widthMm ?? null, unit)}
            error={error("width")}
          />
          <TextField
            id="room-height"
            name="ceilingHeight"
            label="Ceiling height"
            placeholder={system === "metric" ? "2.44 m" : `8'`}
            defaultValue={
              typed("ceilingHeight") ?? lengthValue(room?.ceilingHeightMm ?? null, unit)
            }
            error={error("ceilingHeight")}
          />
        </div>
      </fieldset>
      <TextAreaField
        id="room-description"
        name="description"
        label="Description and existing conditions (optional)"
        defaultValue={typed("description") ?? room?.description ?? ""}
        error={error("description")}
      />
      <TextAreaField
        id="room-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={typed("notes") ?? room?.notes ?? ""}
        error={error("notes")}
      />
      <FormFooter
        pending={pending}
        state={state}
        saveLabel={room ? "Save changes" : "Add room"}
        cancelHref={room ? `/rooms/${room.id}` : "/rooms"}
      />
    </form>
  );
}
