"use client";

import { useId, useState } from "react";

import { inputClass } from "@/components/forms/field";

export type ComparePhoto = { id: string; fileId: string; label: string };

/**
 * A before photo laid over an after photo, with a slider that wipes between
 * them. Pick which two to compare. The slider is an ordinary range input,
 * so it works with a keyboard and a screen reader.
 */
export function BeforeAfter({ before, after }: { before: ComparePhoto[]; after: ComparePhoto[] }) {
  const id = useId();
  const [beforeId, setBeforeId] = useState(before[0]?.id ?? "");
  // The latest after photo is usually the finished result.
  const [afterId, setAfterId] = useState(after[after.length - 1]?.id ?? "");
  const [split, setSplit] = useState(50);
  const left = before.find((p) => p.id === beforeId) ?? before[0];
  const right = after.find((p) => p.id === afterId) ?? after[after.length - 1];
  if (!left || !right) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Before
          <select
            value={left.id}
            onChange={(event) => setBeforeId(event.target.value)}
            className={inputClass}
          >
            {before.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          After
          <select
            value={right.id}
            onChange={(event) => setAfterId(event.target.value)}
            className={inputClass}
          >
            {after.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <figure className="flex flex-col gap-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] border border-border bg-muted">
          {/* Private, per-household files: not next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${right.fileId}`}
            alt={`After: ${right.label}`}
            className="absolute inset-0 size-full object-cover"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${left.fileId}`}
            alt={`Before: ${left.label}`}
            className="absolute inset-0 size-full object-cover"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-surface shadow"
            style={{ left: `${split}%` }}
            aria-hidden="true"
          />
          <span className="absolute top-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium">
            Before
          </span>
          <span className="absolute top-2 right-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium">
            After
          </span>
        </div>
        <label htmlFor={`${id}-split`} className="sr-only">
          How much of the before photo to show
        </label>
        <input
          id={`${id}-split`}
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          aria-valuetext={`${split}% before`}
          className="w-full accent-primary"
        />
      </figure>
    </div>
  );
}
