import type { ComponentProps } from "react";

import { TextField } from "@/components/forms/field";

/** An amount field: a number keypad on phones and iPads, typed as text. */
export function MoneyField(props: ComponentProps<typeof TextField>) {
  return <TextField inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} />;
}
