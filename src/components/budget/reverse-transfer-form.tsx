"use client";

import { TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { reverseTransferAction } from "@/server/actions/budget";

import { useForm } from "./use-form";

/** Undoes a transfer by recording the opposite one; the original stays. */
export function ReverseTransferForm({ transferId }: { transferId: string }) {
  const f = useForm(reverseTransferAction);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Reverse this transfer</summary>
      <form key={f.key} action={f.action} className="mt-2 flex flex-col gap-3" noValidate>
        <input type="hidden" name="transferId" value={transferId} />
        <TextField
          id={`reverse-${transferId}`}
          name="reason"
          label="Why it's being reversed"
          defaultValue={f.typed("reason")}
          error={f.error("reason")}
        />
        <FormFooter pending={f.pending} state={f.state} saveLabel="Reverse it" />
      </form>
    </details>
  );
}
