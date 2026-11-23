"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

// shadcn/ui-style bottom sheet built on Radix Dialog, which handles focus
// trapping, Escape to close and screen-reader labelling for us.
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-card)] border-t border-border bg-surface p-4 pb-8 text-foreground shadow-lg outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger };
