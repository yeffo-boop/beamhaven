"use client";

/**
 * A moment shown in the viewer's own time zone. The server doesn't know it,
 * so the browser formats it (the server's version is replaced on load).
 */
export function LocalTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const text = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
