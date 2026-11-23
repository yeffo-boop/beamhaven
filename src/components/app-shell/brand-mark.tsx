/** The BeamHaven mark: a simple house outline on a spruce tile. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="24" height="24" rx="6" className="fill-primary" />
      <path
        d="M6 13.5 13 7.5l7 6M8.5 12v6.5h9V12M6 18.5h14"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}
