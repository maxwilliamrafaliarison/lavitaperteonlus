import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Cpu, MapPin } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { auth } from "@/auth";
import { getSite, listRooms } from "@/lib/sheets/sites";
import { listMaterials } from "@/lib/sheets/materials";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { Room, Material, Site } from "@/types";

export const dynamic = "force-dynamic";

export default async function SiteRoomsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await auth();
  const lang = session?.user.lang ?? "fr";
  const t = getT(lang);

  const [siteRes, roomsRes, materialsRes] = await Promise.all([
    safe<Site | null>(() => getSite(siteId), null),
    safe<Room[]>(() => listRooms({ siteId }), []),
    safe<Material[]>(() => listMaterials({ siteId }), []),
  ]);

  if (!siteRes.data && !isConfigError(siteRes.error)) {
    notFound();
  }

  const site = siteRes.data;
  const configIssue = isConfigError(siteRes.error);

  return (
    <>
      <AppTopbar title={site?.name ?? t("topbar.site_detail")} />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <Link
            href="/sites"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t("sites.title")}
          </Link>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Building2 className="size-3 text-accent" />
              {site?.code ?? "—"}
            </span>
            <h2 className="mt-3 font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {site?.name ?? t("topbar.site_detail")}
            </h2>
            {site?.city && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {site.city}
              </p>
            )}
          </div>
        </header>

        {roomsRes.data.length === 0 ? (
          <SheetEmptyState
            title={t("sites.site_detail_no_rooms")}
            description={t("sites.site_detail_no_rooms")}
            configError={configIssue}
          />
        ) : (
          <section>
            <h3 className="font-display text-lg font-semibold mb-4">
              {t("sites.site_detail_rooms")} ({roomsRes.data.length})
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roomsRes.data
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((room) => {
                  const count = materialsRes.data.filter((m) => m.roomId === room.id).length;
                  return (
                    <Link
                      key={room.id}
                      href={`/sites/${siteId}/rooms/${room.id}`}
                    >
                      <GlassCard interactive className="h-full p-5 group">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                              {room.code}
                            </p>
                            <h4 className="mt-1 font-medium truncate" title={room.name}>
                              {room.name}
                            </h4>
                            {room.service && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {room.service}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
                        </div>
                        <div className="mt-4 inline-flex items-center gap-1.5 text-sm">
                          <Cpu className="size-3.5 text-primary" />
                          <span className="font-medium">{count}</span>
                          <span className="text-muted-foreground">
                            {t("sites.materials_count")}
                          </span>
                        </div>
                      </GlassCard>
                    </Link>
                  );
                })}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
