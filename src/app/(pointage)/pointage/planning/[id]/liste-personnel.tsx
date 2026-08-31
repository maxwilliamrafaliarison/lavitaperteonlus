"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================
   LISTE DU PERSONNEL — colonne de gauche du planning
   ============================================================

   Elle remplace un sélecteur en tambour, qui empruntait au sélecteur de
   date d'iOS et à la couronne de l'Apple Watch : les noms pivotaient en 3D,
   celui du centre grossissait, et le défilement valait sélection.

   ── POURQUOI CE PATRON NE CONVIENT PAS ICI ───────────────────────────────
   Un tambour sert à choisir dans une suite ORDONNÉE et COURTE, dont on
   connaît d'avance la position : une heure, un mois. Il montre trois ou
   quatre éléments à la fois. Ce planning en compte cinquante-huit, sans
   ordre que l'œil devine, et l'on cherche une personne par son NOM. Pour la
   trouver il fallait faire défiler à l'aveugle, et rien ne permettait de
   voir combien de personnes existaient ni où l'on se situait.

   ── CE QUE FONT LES OUTILS DE PLANNING ───────────────────────────────────
   Tous présentent la même chose : une colonne fixe, un nom par ligne, un
   champ de recherche en tête, des groupes qui portent leur effectif, et la
   charge de chacun à droite du nom. Rien ne bouge, rien ne tourne. On lit,
   on filtre, on clique.

   La charge affichée n'est pas décorative : elle répond à la question qu'on
   se pose en ouvrant un planning, « qui est déjà chargé, qui ne l'est pas »,
   sans avoir à ouvrir chaque fiche pour le découvrir.
   ============================================================ */

export interface PersonneListe {
  id: string;
  nom: string;
  statut: string;
  /** Poste ou service, tel qu'il structure la grille. */
  libelle: string;
  /** Minutes planifiées sur la fenêtre affichée. */
  minutes: number;
  /** Nombre de créneaux sur la fenêtre affichée. */
  creneaux: number;
}

/** "7:30" à partir de minutes ; le tiret quand il n'y a rien. */
function heures(minutes: number): string {
  if (minutes <= 0) return "—";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Sans accents ni casse : « Hervé » se trouve en tapant « herve ». */
const aplatir = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function ListePersonnel({
  personnes,
  selection,
  onChoisir,
}: {
  personnes: PersonneListe[];
  selection: string;
  onChoisir: (id: string) => void;
}) {
  const [recherche, setRecherche] = React.useState("");

  const filtrees = React.useMemo(() => {
    const q = aplatir(recherche.trim());
    if (!q) return personnes;
    return personnes.filter(
      (p) => aplatir(p.nom).includes(q) || aplatir(p.libelle).includes(q),
    );
  }, [personnes, recherche]);

  /* Groupées par statut : salariés et prestataires ne relèvent pas des
     mêmes règles, et la question « qui est prestataire » revient assez
     souvent pour mériter d'être lisible sans cliquer. */
  const groupes = React.useMemo(() => {
    const par = new Map<string, PersonneListe[]>();
    for (const p of filtrees) {
      const cle = p.statut || "Autres";
      (par.get(cle) ?? par.set(cle, []).get(cle)!).push(p);
    }
    for (const liste of par.values()) liste.sort((a, b) => a.nom.localeCompare(b.nom));
    return [...par].sort((a, b) => b[1].length - a[1].length);
  }, [filtrees]);

  return (
    <aside className="w-full shrink-0 sm:w-64">
      <div className="rounded-xl border border-glass-border">
        <div className="border-b border-glass-border p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une personne"
              aria-label="Rechercher une personne dans le planning"
              className="h-9 w-full rounded-lg bg-foreground/[0.04] pl-8 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche("")}
                aria-label="Effacer la recherche"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[32rem] overflow-y-auto overscroll-contain">
          {filtrees.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Personne ne répond à « {recherche} ».
            </p>
          ) : (
            groupes.map(([statut, liste]) => (
              <section key={statut}>
                <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-glass-border bg-background/95 px-3 py-1.5 backdrop-blur">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    {statut}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {liste.length}
                  </span>
                </h3>
                <ul>
                  {liste.map((p) => {
                    const choisi = p.id === selection;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onChoisir(p.id)}
                          aria-current={choisi ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
                            choisi
                              ? "border-l-accent bg-accent/10"
                              : "border-l-transparent hover:bg-foreground/[0.04]",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-[13px] leading-tight",
                                choisi ? "font-semibold text-accent" : "font-medium",
                              )}
                            >
                              {p.nom}
                            </span>
                            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                              {p.libelle}
                            </span>
                          </span>
                          {/* La charge de la fenêtre, alignée en colonne :
                              c'est l'alignement qui rend deux lignes
                              comparables d'un coup d'œil. */}
                          <span className="shrink-0 text-right">
                            <span
                              className={cn(
                                "block text-[11px] tabular-nums leading-tight",
                                p.minutes > 0 ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {heures(p.minutes)}
                            </span>
                            <span className="block text-[10px] leading-tight text-muted-foreground">
                              {p.creneaux > 0 ? `${p.creneaux} cr.` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <p className="border-t border-glass-border px-3 py-2 text-[10px] leading-snug text-muted-foreground">
          {personnes.length} personne{personnes.length > 1 ? "s" : ""} au planning
          {recherche && filtrees.length !== personnes.length ? ` · ${filtrees.length} affichée${filtrees.length > 1 ? "s" : ""}` : ""}
        </p>
      </div>
    </aside>
  );
}
