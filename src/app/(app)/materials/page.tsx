import Link from "next/link";
import { Plus } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassButton } from "@/components/glass/glass-button";
import { MaterialCard } from "@/components/materials/material-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites } from "@/lib/sheets/sites";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { MaterialFilters } from "./material-filters";
import type { Material, Site, MaterialType } from "@/types";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; site?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const role = session?.user.role;
  const lang = session?.user.lang ?? "fr";
  const t = getT(lang);

  const [materialsRes, sitesRes] = await Promise.all([
    safe<Material[]>(
      () =>
        listMaterials({
          siteId: sp.site || undefined,
          type: (sp.type as MaterialType) || undefined,
        }),
      [],
    ),
    safe<Site[]>(() => listSites(), []),
  ]);

  let materials = materialsRes.data;
  if (sp.q) {
    const q = sp.q.toLowerCase();
    materials = materials.filter(
      (m) =>
        m.ref.toLowerCase().includes(q) ||
        m.designation.toLowerCase().includes(q) ||
        (m.brand ?? "").toLowerCase().includes(q) ||
        (m.serialNumber ?? "").toLowerCase().includes(q) ||
        (m.assignedTo ?? "").toLowerCase().includes(q),
    );
  }

  const configIssue = isConfigError(materialsRes.error) || isConfigError(sitesRes.error);

  return (
    <>
      <AppTopbar title={t("topbar.materials")} />

      <main className="flex-1 p-6 md:p-10 space-y-6">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {t("materials_list.eyebrow")}
            </p>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {t("materials_list.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("materials_list.subtitle_total", {
                total: materialsRes.data.length,
                plural: materialsRes.data.length > 1 ? "s" : "",
                shown: materials.length,
                shown_plural: materials.length > 1 ? "s" : "",
              })}
            </p>
          </div>

          {can(role, "material:create") && (
            <Link href="/materials/new">
              <GlassButton variant="brand" size="md" shimmer>
                <Plus className="size-4" />
                {t("materials_list.new_button")}
              </GlassButton>
            </Link>
          )}
        </header>

        <MaterialFilters
          sites={sitesRes.data}
          initialQuery={sp.q ?? ""}
          initialType={sp.type ?? ""}
          initialSite={sp.site ?? ""}
          lang={lang}
        />

        {materialsRes.data.length === 0 ? (
          <SheetEmptyState
            title={t("materials_list.empty_title")}
            description={t("materials_list.empty_desc")}
            configError={configIssue}
          />
        ) : materials.length === 0 ? (
          <div className="rounded-3xl glass border p-10 text-center text-sm text-muted-foreground">
            {t("materials_list.no_results")}
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {materials.map((m) => (
              <MaterialCard key={m.id} material={m} lang={lang} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}
