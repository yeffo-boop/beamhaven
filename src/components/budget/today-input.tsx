"use client";

import { type ComponentProps, useEffect, useRef } from "react";

import { TextField } from "@/components/forms/field";

/**
 * A date field that starts on today's date in the viewer's own time zone
 * (the server doesn't know it), unless it already has a value.
 */
export function DateField(props: ComponentProps<typeof TextField> & { defaultToday?: boolean }) {
  const { defaultToday = false, ...rest } = props;
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = wrapper.current?.querySelector("input");
    if (defaultToday && input && !input.value) input.value = localToday();
  }, [defaultToday]);
  return (
    <div ref={wrapper} className={rest.className}>
      <TextField type="date" {...rest} className={undefined} />
    </div>
  );
}

export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
