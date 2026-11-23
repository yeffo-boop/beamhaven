import { BrandMark } from "@/components/app-shell/brand-mark";
import { brand } from "@/config/brand";

/** A plain centered card for pages used before signing in. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 md:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
