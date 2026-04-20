import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { History, Filter, ArrowRightLeft } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { MovementCard } from "@/components/movements/movement-card";
import { listMovements } from "@/lib/sheets/movements";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listUsers } from "@/lib/sheets/users";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { cn } from "@/lib/utils";
import type {
  Movement, MovementType, Site, Room, Material, AppUser,
} from "@/types";

export const dynamic = "force-dynamic";

type FilterKey = MovementType | "all";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "creation", label: "Créations" },
  { key: "transfert_site", label: "Sites" },
  { key: "transfert_salle", label: "Salles" },
  { key: "transfert_utilisateur", label: "Affectations" },
  { key: "reparation", label: "Réparations" },
  { key: "mise_au_rebut", label: "Rebut" },
  { key: "restauration", label: "Restaurations" },
];

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const filterType = sp.type as MovementType | undefined;

  const [movementsRes, materialsRes, sitesRes, roomsRes, usersRes] = await Promise.all([
    safe<Movement[]>(() => listMovements({ type: filterType, limit: 200 }), []),
    safe<Material[]>(() => listMaterials({ includeDeleted: true }), []),
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
    safe<AppUser[]>(() => listUsers(), []),
  ]);

  const movements = movementsRes.data;
  const materials = materialsRes.data;
  const configIssue = isConfigError(movementsRes.error);

  const siteMap = new Map(sitesRes.data.map((s) => [s.id, s]));
  const roomMap = new Map(roomsRes.data.map((r) => [r.id, r]));
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  const userMap = new Map(usersRes.data.map((u) => [u.id, u]));

  // Compteur par type (sur les 200 derniers)
  const counts = movements.reduce(
    (acc, m) => {
      acc[m.type] = (acc[m.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Regroupement par jour pour la timeline
  const groupedByDay = groupByDay(movements);

  return (
    <>
      <AppTopbar title="Mouvements" />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Historique
          </p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Mouvements du parc
          </h2>
          <p className="mt-2 text-muted-foreground">
            Timeline des transferts, créations, réparations et évolutions —
            les 200 derniers événements.
          </p>
        </header>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Filter className="size-3.5" />
            Filtrer :
          </span>
          {FILTER_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.key}
              href={opt.key === "all" ? "/movements" : `/movements?type=${opt.key}`}
              label={opt.label}
              active={opt.key === "all" ? !filterType : filterType === opt.key}
              count={opt.key === "all" ? movements.length : counts[opt.key]}
            />
          ))}
        </div>

        {movements.length === 0 ? (
          <SheetEmptyState
            title="Aucun mouvement"
            description={
              filterType
                ? "Aucun mouvement avec ce filtre."
                : "L'historique est vide — il se remplira au fur et à mesure des transferts et créations."
            }
            configError={configIssue}
          />
        ) : (
          <div className="space-y-6">
            {groupedByDay.map(({ date, items }) => (
              <section key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <History className="size-3.5" />
                  </div>
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {fmtDayHeader(date)}
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {items.length} événement{items.length > 1 ? "s" : ""}
                  </span>
                  <div className="flex-1 h-px bg-glass-border" />
                </div>
                <GlassCard className="overflow-hidden p-0">
                  <div className="divide-y divide-glass-border">
                    {items.map((m) => (
                      <MovementCard
                        key={m.id}
                        movement={m}
                        siteMap={siteMap}
                        roomMap={roomMap}
                        userLabel={userMap.get(m.byUserId)?.name}
                        materialLabel={
                          materialMap.get(m.materialId)?.designation ??
                          materialMap.get(m.materialId)?.ref ??
                          "Matériel inconnu"
                        }
                        showMaterialLink
                      />
                    ))}
                  </div>
                </GlassCard>
              </section>
            ))}
          </div>
        )}

        {movements.length >= 200 && (
          <p className="text-center text-xs text-muted-foreground">
            Affichage des 200 mouvements les plus récents. La pagination complète
            arrivera dans une prochaine itération.
          </p>
        )}

        {movements.length === 0 && !configIssue && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <ArrowRightLeft className="size-5 mx-auto mb-2 opacity-60" />
            Les transferts sont créés depuis la fiche d&apos;un matériel
            (bouton « Transférer »).
          </div>
        )}
      </main>
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3 h-7 text-xs font-medium transition-all",
        active
          ? "ring-2 ring-primary/40 text-foreground bg-primary/10 border-primary/30"
          : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="font-mono opacity-80 tabular-nums">{count}</span>
      )}
    </a>
  );
}

function groupByDay(movements: Movement[]): { date: string; items: Movement[] }[] {
  const groups = new Map<string, Movement[]>();
  for (const m of movements) {
    const day = m.date.slice(0, 10); // "YYYY-MM-DD"
    const arr = groups.get(day) ?? [];
    arr.push(m);
    groups.set(day, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

function fmtDayHeader(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isToday = d.toDateString() === today.toDateString();
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return "Aujourd'hui";
    if (isYesterday) return "Hier";

    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
