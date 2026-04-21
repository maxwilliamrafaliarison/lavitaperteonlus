import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { MaterialForm } from "@/components/materials/material-form";
import { getMaterial } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { Material, Site, Room } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "material:update")) {
    redirect(`/materials/${id}`);
  }

  const lang = session.user.lang;

  const [matRes, sitesRes, roomsRes] = await Promise.all([
    safe<Material | null>(() => getMaterial(id), null),
    safe<Site[]>(() => listSites({ activeOnly: true }), []),
    safe<Room[]>(() => listRooms(), []),
  ]);

  const material = matRes.data;
  const configIssue =
    isConfigError(matRes.error) ||
    isConfigError(sitesRes.error) ||
    isConfigError(roomsRes.error);

  if (!material && !configIssue) notFound();

  return (
    <>
      <AppTopbar title="Modifier le matériel" />
      <main className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Édition
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Pencil className="size-5" />
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight truncate">
              {material?.designation ?? material?.ref ?? "Matériel"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            {material?.ref}
          </p>
        </header>

        {configIssue || !material ? (
          <SheetEmptyState configError={configIssue} />
        ) : (
          <MaterialForm
            mode="edit"
            material={material}
            sites={sitesRes.data}
            rooms={roomsRes.data}
            lang={lang}
          />
        )}
      </main>
    </>
  );
}
