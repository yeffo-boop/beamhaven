/**
 * The BeamHaven mark, "Post & Beam": a gable roof resting on one long beam
 * that runs past two posts, on a spruce tile. Decorative.
 *
 * The mark is drawn on a 24-unit grid (like our Lucide icons) and placed on a
 * 32-unit tile. src/app/icon.svg, favicon.ico and apple-icon.png use the same
 * geometry; regenerate them if this drawing changes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <g
        transform="translate(5.6 5.6) scale(0.85)"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="stroke-primary-foreground"
      >
        <path d="M5 12 12 5l7 7" />
        <path d="M3 12h18" />
        <path d="M7 12v8M17 12v8" />
      </g>
    </svg>
  );
}
