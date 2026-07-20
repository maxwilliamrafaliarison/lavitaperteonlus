import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  listProduitsAvecStock,
  listFournisseurs,
  listAchats,
} from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import type {
  ProduitAvecStock,
  Fournisseur,
  Achat,
} from "@/lib/pharmacie/types";

import { AchatsForm } from "./achats-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Registre des entrées" };

function ariary(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

export default async function AchatsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pharmacie:stock")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const [prodRes, fournRes, achatsRes] = await Promise.all([
    safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []),
    safe<Fournisseur[]>(() => listFournisseurs(), []),
    safe<Achat[]>(() => listAchats(), []),
  ]);

  const produits = prodRes.data.filter((p) => p.statut === "actif");
  const achats = achatsRes.data.slice(0, 30);

  return (
    <main id="main-content" className="mx-auto max-w-5xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pharmacie.achats_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          {t("pharmacie.achats_subtitle")}
        </p>
      </div>

      <AchatsForm produits={produits} fournisseurs={fournRes.data} lang={lang} />

      {/* Historique des entrées */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.achats_historique")}
        </h2>
        {achats.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">
            {t("pharmacie.achats_hist_vide")}
          </GlassCard>
        ) : (
          <GlassCard className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-left">
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {t("pharmacie.achats_date_facture")}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {t("pharmacie.achats_origine")}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {t("pharmacie.achats_num_facture")}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium text-right">
                    {t("pharmacie.achats_total")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {achats.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {a.date_facture || a.timestamp.slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3">{a.fournisseur || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.num_facture || a.num_bl || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {ariary(a.montant_total)} Ar
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </section>
    </main>
  );
}
