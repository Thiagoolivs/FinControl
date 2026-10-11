import { cookies } from "next/headers";
import { HideValuesProvider } from "@/components/ui/hide-values";
import { requireUser } from "@/lib/auth/dal";
import { HIDE_VALUES_COOKIE } from "@/lib/preferences";
import { AppSideNav, AppTabBar } from "./app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  const hidden = (await cookies()).get(HIDE_VALUES_COOKIE)?.value === "1";
  return (
    <HideValuesProvider initialHidden={hidden}>
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 justify-center gap-12 lg:px-8">
        <aside className="hidden shrink-0 pt-[calc(env(safe-area-inset-top)+72px)] lg:block">
          <AppSideNav />
        </aside>
        <div className="flex w-full max-w-[720px] flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+88px)] lg:pb-16">
          {children}
        </div>
        <AppTabBar />
      </div>
    </HideValuesProvider>
  );
}
