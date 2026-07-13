import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pill } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";
import {
  listProduitsAvecStock,
  listLots,
  listMouvements,
} from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ProduitEditPanel } from "./produit-edit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fiche produit" };

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

export default async function ProduitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const lang = session.user.lang;
  const t = getT(lang);
  const peutEditer = can(session.user.role, "pharmacie:stock");

  const [produitsRes, lotsRes, mouvementsRes] = await Promise.all([
    safe(() => listProduitsAvecStock(), []),
    safe(() => listLots(), []),
    safe(() => listMouvements(), []),
  ]);

  const produit = produitsRes.data.find((p) => p.id === id);
  if (!produit) notFound();

  const lots = lotsRes.data.filter((l) => l.produit_id === id);
  const mouvements = mouvementsRes.data
    .filter((m) => m.produit_id === id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 30);

  const TYPE_TONES: Record<string, string> = {
    entree: "text-[oklch(0.75_0.18_150)]",
    retour: "text-[oklch(0.75_0.18_150)]",
    vente: "text-primary",
    perte: "text-primary",
    destruction: "text-primary",
    ajustement: "text-[oklch(0.82_0.16_85)]",
  };

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
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
              {produit.id}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
              {produit.designation}
              {produit.dosage ? (
                <span className="text-muted-foreground text-xl"> · {produit.dosage}</span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[produit.dci, produit.classe, produit.forme, produit.conditionnement]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("pharmacie.col_stock")}
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {produit.stock}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Colonne gauche : lots + mouvements */}
        <div className="lg:col-span-3 space-y-6">
          <GlassCard className="p-5">
            <h2 className="font-display text-lg font-semibold mb-3">
              {t("pharmacie.fiche_lots")} ({lots.length})
            </h2>
            {lots.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul role="list" className="divide-y divide-glass-border">
                {lots.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-xs">{l.numero_lot}</span>
                    <span
                      className={cn(
                        "font-mono text-xs",
                        l.date_expiration && l.date_expiration < new Date().toISOString().slice(0, 10)
                          ? "text-primary font-semibold"
                          : "text-muted-foreground",
                      )}
                    >
                      {l.date_expiration || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="font-display text-lg font-semibold mb-3">
              {t("pharmacie.fiche_mouvements")} ({mouvements.length})
            </h2>
            {mouvements.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul role="list" className="divide-y divide-glass-border">
                {mouvements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    <Pill className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">
                        <span className={cn("font-medium", TYPE_TONES[m.type])}>
                          {t(`pharmacie.mvt_${m.type}`)}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {m.note || m.reference}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {new Date(m.timestamp).toLocaleString(
                          lang === "it" ? "it-IT" : "fr-FR",
                          { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
                        )}
                        {m.user_email ? ` · ${m.user_email.split("@")[0]}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-mono tabular-nums font-semibold shrink-0",
                        m.quantite > 0
                          ? "text-[oklch(0.75_0.18_150)]"
                          : "text-primary",
                      )}
                    >
                      {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>

        {/* Colonne droite : prix + édition */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="p-5">
            <h2 className="font-display text-lg font-semibold mb-3">
              {t("pharmacie.produit_section_prix")}
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("pharmacie.reception_prix")}</dt>
                <dd className="font-mono tabular-nums">{fmtAr(produit.prix_achat)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("pharmacie.col_prix")}</dt>
                <dd className="font-mono tabular-nums font-semibold">
                  {fmtAr(produit.prix_vente)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("pharmacie.produit_stock_min")}</dt>
                <dd className="font-mono tabular-nums">{produit.stock_min}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("pharmacie.produit_emplacement")}</dt>
                <dd>{produit.emplacement || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("pharmacie.produit_fournisseur")}</dt>
                <dd>{produit.fournisseur || "—"}</dd>
              </div>
            </dl>
          </GlassCard>

          {peutEditer && <ProduitEditPanel produit={produit} lang={lang} />}
        </div>
      </div>
    </main>
  );
}
