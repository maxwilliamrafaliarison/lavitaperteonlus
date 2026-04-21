import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { SettingsForm } from "@/components/settings/settings-form";
import { getUserById } from "@/lib/sheets/users";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { AppUser } from "@/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = getT(session.user.lang);

  const userRes = await safe<AppUser | null>(
    () => getUserById(session.user.id),
    null,
  );
  const user = userRes.data;
  const configIssue = isConfigError(userRes.error);

  return (
    <>
      <AppTopbar title={t("topbar.settings")} />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("settings.eyebrow")}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Settings className="size-5" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {t("settings.title")}
            </h2>
          </div>
          <p className="mt-3 text-muted-foreground">{t("settings.description")}</p>
        </header>

        {configIssue || !user ? (
          <SheetEmptyState configError={configIssue} />
        ) : (
          <SettingsForm user={user} />
        )}
      </main>
    </>
  );
}
