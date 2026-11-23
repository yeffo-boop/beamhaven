import { FileList } from "@/components/records/file-list";
import type { AttachmentSummary } from "@/server/data/files";

/** An expense's receipts. */
export function ReceiptList({
  receipts,
  expenseId,
  canEdit,
}: {
  receipts: AttachmentSummary[];
  expenseId: string;
  canEdit: boolean;
}) {
  return (
    <FileList
      files={receipts}
      target={{ kind: "expense", id: expenseId }}
      noun="receipt"
      canEdit={canEdit}
    />
  );
}
