import { PhoneTabBar, PhoneTopBar } from "@/components/app-shell/phone-nav";
import { Sidebar } from "@/components/app-shell/sidebar";

/**
 * The app shell shared by every signed-in page: sidebar on iPad and laptop,
 * top bar plus bottom tabs on phones (docs/UI_DIRECTION.md).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneTopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12 lg:px-10"
        >
          {children}
        </main>
      </div>
      <PhoneTabBar />
    </div>
  );
}
