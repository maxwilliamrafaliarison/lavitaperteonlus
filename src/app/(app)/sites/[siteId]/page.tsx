import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Cpu, MapPin } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { auth } from "@/auth";
import { getSite, listRooms } from "@/lib/sheets/sites";
import { listMaterials } from "@/lib/sheets/materials";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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

      <main id="main-content" className="flex-1 p-6 md:p-10 space-y-8">
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
          <section aria-label={t("sites.site_detail_rooms")}>
            <h3 className="font-display text-lg font-semibold mb-4">
              {t("sites.site_detail_rooms")} ({roomsRes.data.length})
            </h3>
            <ul
              role="list"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {roomsRes.data
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((room) => {
                  const count = materialsRes.data.filter(
                    (m) => m.roomId === room.id,
                  ).length;
                  return (
                    <li key={room.id}>
                      <RoomTile
                        siteId={siteId}
                        room={room}
                        count={count}
                        countLabel={t("sites.materials_count")}
                      />
                    </li>
                  );
                })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

/* ----------------------------------------------------------------------
   Tuile de salle — style "phosphore" / Apple Liquid Glass
   - Code de salle en énorme, gradient cyan→primary + halo glow
   - Nom et service en dessous, bien lisibles
   - Badge "count matériels" en haut à droite
   - Taille du code adaptée à la longueur (codes numériques courts vs
     codes alphanumériques type "labgal", "COU")
---------------------------------------------------------------------- */
function RoomTile({
  siteId,
  room,
  count,
  countLabel,
}: {
  siteId: string;
  room: Room;
  count: number;
  countLabel: string;
}) {
  const len = room.code.length;
  const codeSize =
    len <= 2
      ? "text-[88px] md:text-[112px]"
      : len <= 4
        ? "text-5xl md:text-6xl"
        : "text-3xl md:text-4xl";

  return (
    <Link
      href={`/sites/${siteId}/rooms/${room.id}`}
      aria-label={`${room.code} · ${room.name} · ${count} ${countLabel}`}
      className="block h-full"
    >
      <GlassCard
        interactive
        className="relative h-full overflow-hidden p-5 group min-h-[200px]"
      >
        {/* Halo "phosphore" derrière le code */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/3 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(ellipse at top, oklch(0.80 0.16 190 / 0.18), transparent 65%)",
          }}
        />

        {/* Badge nombre de matériels — haut droite */}
        <div className="relative z-10 flex justify-end">
          <div className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 h-7 text-xs font-medium tabular-nums shadow-sm">
            <Cpu className="size-3 text-primary" aria-hidden="true" />
            <span>{count}</span>
          </div>
        </div>

        {/* Code en énorme — effet phosphore */}
        <div className="relative z-10 flex items-center justify-center my-3">
          <span
            className={cn(
              "block font-display font-bold leading-none tracking-tight tabular-nums text-center",
              "bg-gradient-to-br from-accent via-accent to-primary",
              "bg-clip-text text-transparent",
              "group-hover:scale-[1.02] transition-transform duration-300",
              codeSize,
            )}
            style={{
              filter:
                "drop-shadow(0 0 24px oklch(0.80 0.16 190 / 0.45)) drop-shadow(0 2px 8px oklch(0.65 0.20 25 / 0.18))",
            }}
          >
            {room.code}
          </span>
        </div>

        {/* Nom de la salle + service */}
        <div className="relative z-10 mt-2 text-center">
          <h4
            className="font-semibold text-sm md:text-base leading-tight line-clamp-2"
            title={room.name}
          >
            {room.name}
          </h4>
          {room.service && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {room.service}
            </p>
          )}
        </div>
      </GlassCard>
    </Link>
  );
}
