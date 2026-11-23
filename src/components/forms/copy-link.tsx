"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** A one-time link shown in a box, with a button to copy it. */
export function CopyLink({ link, label }: { link: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the link is selectable by hand.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        <input
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1.5 h-10 w-full rounded-[var(--radius-control)] border border-input bg-muted px-3 font-mono text-xs"
        />
      </label>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
