import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";
import {
  listProduitsAvecStock,
  listLots,
  listMouvements,
} from "@/lib/pharmacie/sheets";
import type { Mouvement } from "@/lib/pharmacie/types";
import { formaterQuantite } from "@/lib/pharmacie/fractionnement";
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

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium",
        className,
      )}
    >
      {children}
    </th>
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

  // Kardex (idée reprise de l'app d'Eugenio) : chaque mouvement porte le
  // solde de stock APRÈS lui. Notre stock étant la somme des mouvements,
  // on part du stock actuel et on remonte le temps en retirant chaque delta.
  const tousMouvements = mouvementsRes.data
    .filter((m) => m.produit_id === id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const MAX_KARDEX = 50;
  // reduce plutôt qu'un compteur muté dans un map : le compilateur React
  // interdit de réassigner une variable pendant le rendu, et l'accumulateur
  // dit mieux ce qui se passe — chaque ligne porte le solde APRÈS elle,
  // le suivant se déduit en retirant le delta.
  const kardex = tousMouvements.reduce<Array<Mouvement & { solde: number }>>(
    (acc, m) => {
      const solde = acc.length === 0 ? produit.stockBase : acc[acc.length - 1].solde - acc[acc.length - 1].quantite;
      acc.push({ ...m, solde });
      return acc;
    },
    [],
  );
  const mouvements = kardex.slice(0, MAX_KARDEX);

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
              {formaterQuantite(produit, produit.stockBase)}
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

          <GlassCard className="overflow-hidden p-0">
            <div className="p-5 pb-3">
              <h2 className="font-display text-lg font-semibold">
                {t("pharmacie.fiche_mouvements")} ({tousMouvements.length})
              </h2>
              {tousMouvements.length > MAX_KARDEX && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pharmacie.kardex_tronque", { n: MAX_KARDEX })}
                </p>
              )}
            </div>
            {mouvements.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                {t("pharmacie.kardex_vide")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t("pharmacie.fiche_mouvements")}
                  </caption>
                  <thead>
                    <tr className="border-y border-glass-border text-left">
                      <Th>{t("pharmacie.kardex_date")}</Th>
                      <Th>{t("pharmacie.kardex_type")}</Th>
                      <Th className="hidden sm:table-cell">
                        {t("pharmacie.kardex_detail")}
                      </Th>
                      <Th className="text-right">{t("pharmacie.kardex_delta")}</Th>
                      <Th className="text-right">{t("pharmacie.kardex_solde")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border">
                    {mouvements.map((m) => (
                      <tr key={m.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(m.timestamp).toLocaleString(
                            lang === "it" ? "it-IT" : "fr-FR",
                            {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn("font-medium", TYPE_TONES[m.type])}>
                            {t(`pharmacie.mvt_${m.type}`)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                          <span className="line-clamp-1">
                            {m.note || m.reference || "—"}
                          </span>
                          {m.user_email && (
                            <span className="block text-[10px] font-mono opacity-70">
                              {m.user_email.split("@")[0]}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap",
                            m.quantite > 0
                              ? "text-[oklch(0.75_0.18_150)]"
                              : "text-primary",
                          )}
                        >
                          {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-mono tabular-nums",
                            m.solde <= 0 && "text-primary font-semibold",
                          )}
                        >
                          {formaterQuantite(produit, m.solde)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
