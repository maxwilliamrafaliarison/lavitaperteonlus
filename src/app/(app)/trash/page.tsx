import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { TrashManager } from "@/components/trash/trash-manager";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { Material, Site, Room } from "@/types";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const lang = session.user.lang ?? "fr";
  const t = getT(lang);

  const [materialsRes, sitesRes, roomsRes] = await Promise.all([
    safe<Material[]>(() => listMaterials({ includeDeleted: true }), []),
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
  ]);

  // On ne garde que les matériels soft-deleted
  const trashed = materialsRes.data.filter((m) => m.deletedAt);
  const configIssue = isConfigError(materialsRes.error);

  // Tri : plus récemment supprimés en premier
  trashed.sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
  );

  return (
    <>
      <AppTopbar title={t("topbar.trash")} />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("trash.eyebrow")}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Trash2 className="size-5" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {t("trash.title")}
            </h2>
            {trashed.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums ml-2">
                {trashed.length > 1
                  ? t("trash.item_count_many", { n: trashed.length })
                  : t("trash.item_count_one", { n: trashed.length })}
              </span>
            )}
          </div>
          <p className="mt-3 text-muted-foreground">
            {t("trash.subtitle")}
          </p>
        </header>

        {configIssue ? (
          <SheetEmptyState configError />
        ) : (
          <TrashManager
            items={trashed}
            sites={sitesRes.data}
            rooms={roomsRes.data}
            lang={lang}
          />
        )}
      </main>
    </>
  );
}
