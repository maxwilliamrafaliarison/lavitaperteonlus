import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================
   SÉLECTEUR D'ÉTENDUE — jour / semaine / mois / six mois
   ============================================================
   Quatre échelles pour quatre usages : vérifier une journée, organiser une
   semaine, contrôler un mois, repérer les tendances d'un semestre.

   Volontairement en LIENS et non en boutons : l'étendue vit dans l'URL, ce
   qui rend chaque vue partageable, ajoutable aux favoris, et navigable avec
   les flèches du navigateur. Aucun JavaScript n'est requis pour changer de
   vue — utile sur les connexions du centre.
   ============================================================ */

export type Vue = "jour" | "semaine" | "mois" | "six";

export const VUES: Array<{ id: Vue; libelle: string; jours: number }> = [
  { id: "jour", libelle: "Jour", jours: 1 },
  { id: "semaine", libelle: "Semaine", jours: 7 },
  { id: "mois", libelle: "Mois", jours: 31 },
  { id: "six", libelle: "Six mois", jours: 183 },
];

export const dureeDe = (v: Vue) => VUES.find((x) => x.id === v)?.jours ?? 31;

/** Ajoute (ou retire) des jours à une date "YYYY-MM-DD". */
export function decalerJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function SelecteurVue({
  planningId,
  vue,
  debut,
  bornes,
}: {
  planningId: string;
  vue: Vue;
  debut: string;
  /** Bornes du planning, pour ne pas proposer de naviguer hors période. */
  bornes: { du: string; au: string };
}) {
  const pas = dureeDe(vue);
  const lien = (v: Vue, d: string) => `/pointage/planning/${planningId}?vue=${v}&debut=${d}`;

  // On borne la navigation au planning : sortir de la période afficherait
  // des colonnes vides sans qu'on comprenne pourquoi.
  const precedent = decalerJour(debut, -pas);
  const suivant = decalerJour(debut, pas);
  const peutReculer = precedent >= decalerJour(bornes.du, -pas);
  const peutAvancer = suivant <= bornes.au;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav className="flex gap-1 rounded-xl border border-glass-border p-1" aria-label="Étendue affichée">
        {VUES.map((v) => (
          <Link
            key={v.id}
            href={lien(v.id, debut)}
            aria-current={vue === v.id ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              vue === v.id
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            {v.libelle}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1">
        <Fleche href={lien(vue, precotect(precedent, bornes.du))} actif={peutReculer} sens="precedent" />
        <Fleche href={lien(vue, suivant)} actif={peutAvancer} sens="suivant" />
      </div>
    </div>
  );
}

/** Ne recule pas avant le début du planning. */
function precotect(candidat: string, min: string): string {
  return candidat < min ? min : candidat;
}

function Fleche({ href, actif, sens }: { href: string; actif: boolean; sens: "precedent" | "suivant" }) {
  const Icone = sens === "precedent" ? ChevronLeft : ChevronRight;
  const label = sens === "precedent" ? "Période précédente" : "Période suivante";
  if (!actif) {
    return (
      <span
        aria-disabled="true"
        title={label}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-glass-border text-muted-foreground/30"
      >
        <Icone className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-xl border border-glass-border text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
    >
      <Icone className="size-4" aria-hidden="true" />
    </Link>
  );
}
