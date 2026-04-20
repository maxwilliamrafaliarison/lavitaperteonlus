import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Plus } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { MaterialCard } from "@/components/materials/material-card";
import { GlassButton } from "@/components/glass/glass-button";
import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getRoom, getSite } from "@/lib/sheets/sites";
import { listMaterials } from "@/lib/sheets/materials";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { Site, Room, Material } from "@/types";

export const dynamic = "force-dynamic";

export default async function RoomMaterialsPage({
  params,
}: {
  params: Promise<{ siteId: string; roomId: string }>;
}) {
  const { siteId, roomId } = await params;
  const session = await auth();
  const role = session?.user.role;

  const [siteRes, roomRes, materialsRes] = await Promise.all([
    safe<Site | null>(() => getSite(siteId), null),
    safe<Room | null>(() => getRoom(roomId), null),
    safe<Material[]>(() => listMaterials({ siteId, roomId }), []),
  ]);

  if (!roomRes.data && !isConfigError(roomRes.error)) notFound();

  const site = siteRes.data;
  const room = roomRes.data;
  const configIssue = isConfigError(roomRes.error);

  return (
    <>
      <AppTopbar title={room?.name ?? "Salle"} />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div className="max-w-3xl">
            <Link
              href={`/sites/${siteId}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              {site?.name ?? "Site"}
            </Link>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground font-mono">
                {room?.code ?? "—"}
              </span>
              <h2 className="mt-3 font-display text-3xl md:text-4xl font-semibold tracking-tight">
                {room?.name ?? "Salle introuvable"}
              </h2>
              {room?.service && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {room.service}
                </p>
              )}
            </div>
          </div>

          {can(role, "material:create") && (
            <Link href={`/materials/new?siteId=${siteId}&roomId=${roomId}`}>
              <GlassButton variant="brand" size="md" shimmer>
                <Plus className="size-4" />
                Ajouter un matériel
              </GlassButton>
            </Link>
          )}
        </header>

        {materialsRes.data.length === 0 ? (
          <SheetEmptyState
            title="Aucun matériel dans cette salle"
            description="Cette salle n'a pas encore de matériel enregistré."
            configError={configIssue}
          />
        ) : (
          <section>
            <h3 className="font-display text-lg font-semibold mb-4">
              {materialsRes.data.length} matériel
              {materialsRes.data.length > 1 ? "s" : ""}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {materialsRes.data.map((material) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  lang={session?.user.lang ?? "fr"}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
