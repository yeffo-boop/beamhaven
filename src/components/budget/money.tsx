import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** An amount in cents, in tabular figures so columns line up. */
export function Money({
  cents,
  showPlus = false,
  className,
}: {
  cents: bigint;
  showPlus?: boolean;
  className?: string;
}) {
  return <span className={cn("tabular-nums", className)}>{formatMoney(cents, { showPlus })}</span>;
}

/**
 * What's available on a line or project. When it's below zero it says so
 * in words ("Over by"), not only in red.
 */
export function Available({ cents }: { cents: bigint }) {
  if (cents < 0n) {
    return (
      <span className="font-medium text-destructive tabular-nums">
        Over by {formatMoney(-cents)}
      </span>
    );
  }
  return <Money cents={cents} />;
}
