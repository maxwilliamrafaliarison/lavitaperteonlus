import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { MaterialForm } from "@/components/materials/material-form";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { Site, Room } from "@/types";

export const dynamic = "force-dynamic";

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; roomId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "material:create")) redirect("/materials");

  const sp = await searchParams;
  const lang = session.user.lang;

  const [sitesRes, roomsRes] = await Promise.all([
    safe<Site[]>(() => listSites({ activeOnly: true }), []),
    safe<Room[]>(() => listRooms(), []),
  ]);
  const configIssue =
    isConfigError(sitesRes.error) || isConfigError(roomsRes.error);

  return (
    <>
      <AppTopbar title="Nouveau matériel" />
      <main className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Parc informatique
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Plus className="size-5" />
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Nouveau matériel
            </h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Ajoute un matériel au parc du Centre REX ou MIARAKA. Les champs
            marqués d&apos;un{" "}
            <span className="text-primary font-medium">*</span> sont
            obligatoires.
          </p>
        </header>

        {configIssue ? (
          <SheetEmptyState configError />
        ) : sitesRes.data.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-muted-foreground">
            Aucun site trouvé. Contactez l&apos;administrateur.
          </GlassCard>
        ) : (
          <MaterialForm
            mode="create"
            sites={sitesRes.data}
            rooms={roomsRes.data}
            defaultSiteId={sp.siteId}
            defaultRoomId={sp.roomId}
            lang={lang}
          />
        )}
      </main>
    </>
  );
}
