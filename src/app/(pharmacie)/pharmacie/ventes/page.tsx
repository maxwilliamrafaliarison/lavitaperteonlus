import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listVentes } from "@/lib/pharmacie/sheets";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { getT } from "@/lib/i18n";
import type { VenteResume } from "@/lib/pharmacie/sheets";

import { VentesList } from "./ventes-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Historique des ventes" };

export default async function VentesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const lang = session.user.lang;
  const t = getT(lang);
  const peutAnnuler = can(session.user.role, "pharmacie:vendre");

  const res = await safe<VenteResume[]>(() => listVentes(), []);

  return (
    <main id="main-content" className="mx-auto max-w-7xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pharmacie.ventes_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pharmacie.ventes_subtitle", { n: res.data.length })}
        </p>
      </div>

      {res.data.length === 0 ? (
        <SheetEmptyState
          title={t("pharmacie.ventes_empty_title")}
          description={t("pharmacie.ventes_empty_desc")}
          configError={isConfigError(res.error)}
        />
      ) : (
        <VentesList ventes={res.data} lang={lang} peutAnnuler={peutAnnuler} />
      )}
    </main>
  );
}
