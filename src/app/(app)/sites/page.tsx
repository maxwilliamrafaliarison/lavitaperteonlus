import Link from "next/link";
import { Building2, Cpu, ArrowRight, MapPin } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listMaterials } from "@/lib/sheets/materials";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { Site, Room, Material } from "@/types";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const [sitesRes, roomsRes, materialsRes] = await Promise.all([
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
    safe<Material[]>(() => listMaterials(), []),
  ]);

  const configIssue =
    isConfigError(sitesRes.error) ||
    isConfigError(roomsRes.error) ||
    isConfigError(materialsRes.error);

  return (
    <>
      <AppTopbar title="Sites & salles" />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Vue d&apos;ensemble
          </p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Centres et salles
          </h2>
          <p className="mt-2 text-muted-foreground">
            Naviguez par site puis par salle pour explorer le parc matériel.
          </p>
        </header>

        {sitesRes.data.length === 0 ? (
          <SheetEmptyState
            title="Aucun site dans le Sheet"
            description="Exécutez le script Apps Script `setupSheet()` pour créer la structure et les seeds."
            configError={configIssue}
          />
        ) : (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sitesRes.data.map((site) => {
              const siteRooms = roomsRes.data.filter((r) => r.siteId === site.id);
              const siteMaterials = materialsRes.data.filter(
                (m) => m.siteId === site.id,
              );
              return (
                <Link key={site.id} href={`/sites/${site.id}`}>
                  <GlassCard interactive glow="brand" className="h-full p-7 group">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          <Building2 className="size-3 text-accent" />
                          {site.code}
                        </span>
                        <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                          {site.name}
                        </h3>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {site.city}
                        </p>
                      </div>
                      <ArrowRight className="size-5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <Stat
                        icon={<Building2 className="size-4" />}
                        label="Salles"
                        value={siteRooms.length}
                      />
                      <Stat
                        icon={<Cpu className="size-4" />}
                        label="Matériels"
                        value={siteMaterials.length}
                      />
                    </div>

                    {site.address && (
                      <p className="mt-4 text-xs text-muted-foreground line-clamp-2">
                        {site.address}
                      </p>
                    )}
                  </GlassCard>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl glass border px-3 py-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}
