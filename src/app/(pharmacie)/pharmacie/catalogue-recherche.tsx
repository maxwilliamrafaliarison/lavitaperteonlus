"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Plus, X, Pencil } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { BadgeGalenique } from "@/components/pharmacie/badge-galenique";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ============================================================
   CATALOGUE CHERCHABLE — tableau de bord Pharmacie
   ============================================================

   Cent produits ne se parcourent pas à l'œil. Tout le monde au centre a
   besoin de répondre « l'avons-nous, à quel prix, combien en reste-t-il »
   sans passer par l'écran de vente — qui, lui, sert à encaisser.

   Les lignes arrivent PRÉ-CALCULÉES du serveur : libellé de stock, prix
   affiché, état. La logique métier — conversion boîte/unité, seuils,
   péremption — reste côté serveur, en un seul exemplaire. Ce composant
   ne fait que filtrer et rendre.
   ============================================================ */

export interface LigneCatalogue {
  id: string;
  designation: string;
  dci: string;
  dosage: string;
  classe: string;
  galenique: boolean;
  stockLibelle: string;
  prixLibelle: string;
  peremption: string;
  /** Fournisseur habituel, vide si aucun n'est renseigné. */
  fournisseur: string;
  /** Repère visuel : ce qui appelle une action. */
  etat: "ok" | "bas" | "rupture" | "bientot" | "perime";
  etatLibelle: string;
}

type Filtre = "tous" | "rupture" | "bas" | "peremption" | "galenique";

export function CatalogueRecherche({
  lignes,
  lang,
  peutModifier,
}: {
  lignes: LigneCatalogue[];
  lang: Lang;
  /** Ajout et modification réservés à qui gère le stock. */
  peutModifier: boolean;
}) {
  const t = React.useMemo(() => getT(lang), [lang]);
  const [q, setQ] = React.useState("");
  const [filtre, setFiltre] = React.useState<Filtre>("tous");
  /* Fournisseur : liste déroulante plutôt qu'onglet — ils sont trop
     nombreux pour tenir en boutons, et le besoin est ponctuel (préparer
     une commande, vérifier ce qu'on tient d'un même laboratoire). */
  const [fournisseur, setFournisseur] = React.useState("");

  const fournisseurs = React.useMemo(
    () => [...new Set(lignes.map((l) => l.fournisseur).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );

  const resultats = React.useMemo(() => {
    const requete = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (filtre === "rupture" && l.etat !== "rupture") return false;
      if (filtre === "bas" && l.etat !== "bas") return false;
      if (filtre === "peremption" && l.etat !== "bientot" && l.etat !== "perime") return false;
      if (filtre === "galenique" && !l.galenique) return false;
      if (fournisseur && l.fournisseur !== fournisseur) return false;
      if (!requete) return true;
      /* Recherche sur le nom commercial, la molécule et la référence : au
         comptoir on demande aussi bien « du Doliprane » que « du
         paracétamol », et l'ordonnance porte parfois l'un, parfois l'autre. */
      return (
        l.designation.toLowerCase().includes(requete) ||
        l.dci.toLowerCase().includes(requete) ||
        l.id.toLowerCase().includes(requete) ||
        l.classe.toLowerCase().includes(requete)
      );
    });
  }, [lignes, q, filtre, fournisseur]);

  const compte = (f: Filtre) =>
    f === "tous"
      ? lignes.length
      : f === "rupture"
        ? lignes.filter((l) => l.etat === "rupture").length
        : f === "bas"
          ? lignes.filter((l) => l.etat === "bas").length
          : f === "peremption"
            ? lignes.filter((l) => l.etat === "bientot" || l.etat === "perime").length
            : lignes.filter((l) => l.galenique).length;

  const onglets: { cle: Filtre; libelle: string }[] = [
    { cle: "tous", libelle: t("pharmacie.cat_tous") },
    { cle: "rupture", libelle: t("pharmacie.cat_rupture") },
    { cle: "bas", libelle: t("pharmacie.cat_bas") },
    { cle: "peremption", libelle: t("pharmacie.cat_peremption") },
    { cle: "galenique", libelle: t("pharmacie.cat_galenique") },
  ];

  return (
    <section aria-label={t("pharmacie.list_title")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t("pharmacie.list_title")}</h2>
        {peutModifier && (
          <Link href="/pharmacie/produits/nouveau" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="size-4" aria-hidden="true" />
            {t("pharmacie.cat_nouveau")}
          </Link>
        )}
      </div>

      {/* Recherche : le champ prend la main au clavier, la croix vide vite. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder={t("pharmacie.cat_recherche")}
          aria-label={t("pharmacie.cat_recherche")}
          className="h-12 w-full rounded-2xl glass border pl-11 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label={t("common.close")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {onglets.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setFiltre(o.cle)}
            aria-pressed={filtre === o.cle}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              filtre === o.cle
                ? "border-accent bg-accent/12 text-accent"
                : "border-glass-border text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
          >
            {o.libelle}
            <span className="tabular-nums opacity-70">{compte(o.cle)}</span>
          </button>
        ))}

        {fournisseurs.length > 0 && (
          <select
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            aria-label={t("pharmacie.cat_fournisseur")}
            className={cn(
              "h-9 rounded-xl border bg-transparent px-3 text-xs font-medium transition-colors",
              fournisseur
                ? "border-accent bg-accent/12 text-accent"
                : "border-glass-border text-muted-foreground hover:text-foreground",
            )}
          >
            <option value="">{t("pharmacie.cat_fournisseur")}</option>
            {fournisseurs.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>

      <GlassCard className="overflow-hidden p-0">
        {resultats.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("pharmacie.cat_aucun")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("pharmacie.list_title")}</caption>
              <thead>
                <tr className="border-b border-glass-border text-left">
                  <Th>{t("pharmacie.col_designation")}</Th>
                  <Th className="hidden md:table-cell">{t("pharmacie.col_classe")}</Th>
                  <Th className="text-right">{t("pharmacie.col_stock")}</Th>
                  <Th className="text-right hidden sm:table-cell">{t("pharmacie.col_prix")}</Th>
                  <Th className="hidden lg:table-cell">{t("pharmacie.col_peremption")}</Th>
                  <Th>{t("pharmacie.col_statut")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {resultats.map((l) => (
                  <tr key={l.id} className="hover:bg-foreground/3 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pharmacie/produits/${l.id}`}
                        className="group/link block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <span className="inline-flex flex-wrap items-center gap-1.5 font-medium leading-tight transition-colors group-hover/link:text-accent">
                          {l.designation}
                          {l.galenique && <BadgeGalenique />}
                          {peutModifier && (
                            <Pencil
                              className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {l.id}
                          {l.dosage ? ` · ${l.dosage}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {l.classe || "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono tabular-nums",
                        l.etat === "rupture" && "text-primary font-semibold",
                        l.etat === "bas" && "text-[var(--warning)]",
                      )}
                    >
                      {l.stockLibelle}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums hidden sm:table-cell">
                      {l.prixLibelle}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 hidden lg:table-cell text-xs",
                        l.etat === "perime" && "text-primary font-medium",
                        l.etat === "bientot" && "text-[var(--warning)]",
                      )}
                    >
                      {l.peremption}
                    </td>
                    <td className="px-4 py-3">
                      <Etat etat={l.etat} libelle={l.etatLibelle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        {t("pharmacie.cat_resultats", { n: resultats.length, total: lignes.length })}
      </p>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Etat({ etat, libelle }: { etat: LigneCatalogue["etat"]; libelle: string }) {
  const ton =
    etat === "rupture" || etat === "perime"
      ? "border-primary/30 bg-primary/12 text-primary"
      : etat === "bas" || etat === "bientot"
        ? "border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]"
        : "border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]";
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
        ton,
      )}
    >
      {libelle}
    </span>
  );
}
