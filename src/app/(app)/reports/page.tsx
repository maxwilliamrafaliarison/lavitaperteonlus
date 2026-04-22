import { redirect } from "next/navigation";
import { FileBarChart2 } from "lucide-react";

import { auth } from "@/auth";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { ReportsManager } from "@/components/reports/reports-manager";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listUsers } from "@/lib/sheets/users";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { Site, Room, AppUser } from "@/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lang = session.user.lang ?? "fr";
  const t = getT(lang);

  const [sitesRes, roomsRes, usersRes] = await Promise.all([
    safe<Site[]>(() => listSites({ activeOnly: true }), []),
    safe<Room[]>(() => listRooms(), []),
    safe<AppUser[]>(() => listUsers(), []),
  ]);

  const configIssue =
    isConfigError(sitesRes.error) || isConfigError(roomsRes.error);

  return (
    <>
      <AppTopbar title={t("topbar.reports")} />
      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("reports.eyebrow")}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <FileBarChart2 className="size-5" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {t("reports.title")}
            </h2>
          </div>
          <p className="mt-3 text-muted-foreground">{t("reports.subtitle")}</p>
        </header>

        {configIssue ? (
          <SheetEmptyState configError />
        ) : (
          <ReportsManager
            sites={sitesRes.data}
            rooms={roomsRes.data}
            users={usersRes.data}
            lang={lang}
          />
        )}
      </main>
    </>
  );
}
