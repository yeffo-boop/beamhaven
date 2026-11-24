"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export type UploadState = {
  busy: boolean;
  message?: string;
  error?: boolean;
  fields: Record<string, string | undefined>;
  values: Record<string, string>;
  attempt: number;
};

/**
 * Sends a form with its file to an upload route (/api/documents,
 * /api/boards/items) and reads back the new id. Server Actions limit how
 * big a request can be, so files go through that route instead.
 */
export function useUpload(url: string, idKey: string, onDone: (id: string) => void) {
  const [state, setState] = useState<UploadState>({
    busy: false,
    fields: {},
    values: {},
    attempt: 0,
  });
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const values = Object.fromEntries(
      [...data].filter((e): e is [string, string] => typeof e[1] === "string"),
    );
    setState((s) => ({ ...s, busy: true, message: "Uploading…", error: false, fields: {} }));
    try {
      const response = await fetch(url, { method: "POST", body: data });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        [key: string]: unknown;
      };
      const id = body[idKey];
      if (!response.ok || typeof id !== "string") {
        setState((s) => ({
          busy: false,
          error: true,
          message: body.error ?? "The upload didn't work.",
          fields: body.fields ?? {},
          values,
          attempt: s.attempt + 1,
        }));
        return;
      }
      setState((s) => ({
        busy: false,
        message: "Saved.",
        fields: {},
        values: {},
        attempt: s.attempt + 1,
      }));
      onDone(id);
    } catch {
      setState((s) => ({
        ...s,
        busy: false,
        error: true,
        message: "The upload didn't work. Check your connection.",
      }));
    }
  }
  return { state, submit };
}

export function UploadFooter({ state, label }: { state: UploadState; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={state.busy}>
        {state.busy ? "Uploading…" : label}
      </Button>
      <p
        role="status"
        className={state.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {state.message}
      </p>
    </div>
  );
}
