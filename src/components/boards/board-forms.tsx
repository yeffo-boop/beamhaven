"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { UploadFooter, useUpload } from "@/components/forms/use-upload";
import { FormFooter } from "@/components/records/form-footer";
import { saveBoardAction, saveBoardItemAction } from "@/server/actions/boards";
import {
  BOARD_ITEM_KIND_LABELS,
  BOARD_ITEM_KINDS,
  type BoardItemKind,
} from "@/server/services/board-inputs";

type Choice = { value: string; label: string };

export type BoardValues = { name: string; roomId: string; projectId: string; notes: string };

/** Starts a board (then opens it) or changes its name, room, project and notes. */
export function BoardForm({
  board,
  rooms,
  projects,
}: {
  board?: BoardValues & { id: string };
  rooms: Choice[];
  projects: Choice[];
}) {
  const f = useForm(saveBoardAction);
  const prefix = board ? "edit-board" : "new-board";
  const value = (name: keyof BoardValues) => f.typed(name) ?? board?.[name] ?? "";
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {board ? <input type="hidden" name="id" value={board.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${prefix}-name`}
          name="name"
          label="Board name"
          placeholder="Kitchen finishes"
          defaultValue={value("name")}
          error={f.error("name")}
        />
        <SelectField
          id={`${prefix}-room`}
          name="roomId"
          label="Room (optional)"
          options={[{ value: "", label: "No particular room" }, ...rooms]}
          defaultValue={value("roomId")}
          error={f.error("roomId")}
        />
        <SelectField
          id={`${prefix}-project`}
          name="projectId"
          label="Project (optional)"
          options={[{ value: "", label: "No project" }, ...projects]}
          defaultValue={value("projectId")}
          error={f.error("projectId")}
        />
      </div>
      <TextAreaField
        id={`${prefix}-notes`}
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={board ? "Save changes" : "Start board"}
      />
    </form>
  );
}

const KIND_OPTIONS = BOARD_ITEM_KINDS.map((k) => ({ value: k, label: BOARD_ITEM_KIND_LABELS[k] }));
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif";

/** A color picker with a text box beside it, so a paint code's hex can be typed or pasted. */
function ColorField({
  idPrefix,
  defaultValue,
  error,
}: {
  idPrefix: string;
  defaultValue: string;
  error: string | undefined;
}) {
  const [color, setColor] = useState(defaultValue);
  const swatch = /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
  return (
    <div className="flex items-end gap-2">
      <input
        type="color"
        aria-label="Pick the color"
        value={swatch}
        onChange={(event) => setColor(event.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-border bg-surface p-1"
      />
      <TextField
        id={`${idPrefix}-color`}
        name="colorHex"
        label="Color"
        placeholder="#3a5f4b"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        error={error}
        className="flex-1"
      />
    </div>
  );
}

/** The fields shared by adding and editing; which show depends on the kind. */
function ItemFields({
  idPrefix,
  kind,
  values,
  errors,
  materials,
}: {
  idPrefix: string;
  kind: BoardItemKind;
  values: Record<string, string>;
  errors: Record<string, string | undefined>;
  materials: Choice[];
}) {
  const isColor = kind === "color";
  const hasProduct = kind === "product" || kind === "finish";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-title`}
          name="title"
          label="Name"
          placeholder={
            isColor ? "Sage green" : kind === "product" ? "Brass pendant light" : "Kitchen idea"
          }
          defaultValue={values["title"] ?? ""}
          error={errors["title"]}
        />
        {isColor || kind === "finish" ? (
          <ColorField
            idPrefix={idPrefix}
            defaultValue={values["colorHex"] ?? ""}
            error={errors["colorHex"]}
          />
        ) : null}
        {isColor || hasProduct ? (
          <TextField
            id={`${idPrefix}-brand`}
            name="brand"
            label="Brand (optional)"
            placeholder={isColor ? "Benjamin Moore" : ""}
            defaultValue={values["brand"] ?? ""}
            error={errors["brand"]}
          />
        ) : null}
        {isColor || hasProduct ? (
          <TextField
            id={`${idPrefix}-code`}
            name="code"
            label={isColor ? "Color code (optional)" : "Model or SKU (optional)"}
            defaultValue={values["code"] ?? ""}
            error={errors["code"]}
          />
        ) : null}
        {hasProduct || kind === "image" ? (
          <TextField
            id={`${idPrefix}-url`}
            name="productUrl"
            label={kind === "image" ? "Where it's from (optional)" : "Link (optional)"}
            placeholder="https://"
            defaultValue={values["productUrl"] ?? ""}
            error={errors["productUrl"]}
          />
        ) : null}
        {hasProduct ? (
          <SelectField
            id={`${idPrefix}-material`}
            name="materialId"
            label="Material (optional)"
            hint="Link it to a material you're tracking."
            options={[{ value: "", label: "Not linked" }, ...materials]}
            defaultValue={values["materialId"] ?? ""}
            error={errors["materialId"]}
          />
        ) : null}
      </div>
      <TextAreaField
        id={`${idPrefix}-notes`}
        name="notes"
        label="Notes (optional)"
        defaultValue={values["notes"] ?? ""}
        error={errors["notes"]}
      />
    </>
  );
}

/** Adds an image, product, color or finish to the end of a board. */
export function AddBoardItemForm({ boardId, materials }: { boardId: string; materials: Choice[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileId = useId();
  const [kind, setKind] = useState<BoardItemKind>("image");
  const { state, submit } = useUpload("/api/boards/items", "itemId", () => {
    formRef.current?.reset();
    router.refresh();
  });
  const fileError = state.fields["file"];
  return (
    <form
      ref={formRef}
      key={state.attempt}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <input type="hidden" name="boardId" value={boardId} />
      <div className="sm:max-w-xs">
        <SelectField
          id="new-item-kind"
          name="kind"
          label="What is it?"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(event) => setKind(event.target.value as BoardItemKind)}
          error={state.fields["kind"]}
        />
      </div>
      <ItemFields
        idPrefix="new-item"
        kind={kind}
        values={state.values}
        errors={state.fields}
        materials={materials}
      />
      {kind !== "color" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-sm font-medium">
            {kind === "image" ? "Picture" : "Picture (optional)"}
          </label>
          <input
            id={fileId}
            name="file"
            type="file"
            accept={ACCEPT}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? `${fileId}-error` : undefined}
            className="text-sm file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
          />
          {fileError ? (
            <p id={`${fileId}-error`} className="text-sm text-destructive">
              {fileError}
            </p>
          ) : null}
        </div>
      ) : null}
      <UploadFooter state={state} label="Add to board" />
    </form>
  );
}

/** Changes an item's words, color, link or material. */
export function EditBoardItemForm({
  boardId,
  item,
  materials,
}: {
  boardId: string;
  item: Record<string, string> & { id: string; kind: string };
  materials: Choice[];
}) {
  const f = useForm(saveBoardItemAction);
  const values = Object.fromEntries(
    Object.entries(item).map(([name, value]) => [name, f.typed(name) ?? value]),
  );
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="id" value={item.id} />
      <ItemFields
        idPrefix={`item-${item.id}`}
        kind={item.kind as BoardItemKind}
        values={values}
        errors={{
          title: f.error("title"),
          notes: f.error("notes"),
          colorHex: f.error("colorHex"),
          brand: f.error("brand"),
          code: f.error("code"),
          productUrl: f.error("productUrl"),
          materialId: f.error("materialId"),
        }}
        materials={materials}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save changes" />
    </form>
  );
}
