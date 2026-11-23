"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { applyTheme, readStoredTheme, THEME_STORAGE_KEY, type ThemeChoice } from "./theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match device", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Three-way appearance switch. `compact` shows icons only (sidebar rail);
 * otherwise each option has a visible label (Settings page).
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // The server can't know the stored choice, so it renders "system" first.
  const current = useSyncExternalStore(subscribe, readStoredTheme, () => "system" as const);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex rounded-[var(--radius-control)] border border-border bg-background p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              compact ? "w-9" : "px-3",
              selected
                ? "bg-surface font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
