"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/* ============================================================
   ROULETTE DU PERSONNEL — sélecteur en tambour, à gauche du planning
   ============================================================
   Trois patrons éprouvés, combinés :
   • le TAMBOUR du sélecteur de date iOS : les éléments pivotent en 3D selon
     leur distance au centre, comme sur un cylindre ;
   • l'effet COURONNE de l'Apple Watch : l'élément centré grossit, les
     voisins s'estompent — l'œil sait toujours qui est choisi ;
   • le SCROLL-SNAP natif du navigateur : l'accroche au centre est faite par
     le moteur de rendu, pas par du JavaScript qui lutte contre l'inertie.

   Le défilement EST la sélection : arrêter la molette sur un nom l'ouvre.
   Un clic sur un nom l'amène au centre. Les flèches du clavier fonctionnent
   (le composant est une listbox). Aucune bibliothèque.
   ============================================================ */

export interface PersonneRoulette {
  id: string;
  nom: string;
  statut: string;
}

const H_ITEM = 44;

/** Initiales pour l'avatar (deux lettres au plus). */
function initiales(nom: string): string {
  const mots = nom.split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Teinte d'avatar stable par personne (dérivée du nom, pas au hasard). */
function teinteAvatar(nom: string): string {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.72 0.14 ${h})`;
}

export function RoulettePersonnel({
  personnes,
  selection,
  onChoisir,
}: {
  personnes: PersonneRoulette[];
  selection: string;
  onChoisir: (id: string) => void;
}) {
  const bande = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [centre, setCentre] = React.useState(() =>
    Math.max(0, personnes.findIndex((p) => p.id === selection)),
  );

  // Position initiale : la personne choisie au centre, sans animation.
  React.useEffect(() => {
    const el = bande.current;
    if (!el) return;
    const idx = Math.max(0, personnes.findIndex((p) => p.id === selection));
    el.scrollTop = idx * H_ITEM;
    setCentre(idx);
    // Volontairement au montage seulement : ensuite, c'est la roulette qui
    // commande la sélection, pas l'inverse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function surDefilement() {
    const el = bande.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(personnes.length - 1, Math.round(el.scrollTop / H_ITEM)));
    setCentre(idx);
    // La sélection se confirme quand le tambour s'arrête.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = personnes[idx];
      if (p && p.id !== selection) onChoisir(p.id);
    }, 160);
  }

  function versIndex(idx: number) {
    bande.current?.scrollTo({ top: idx * H_ITEM, behavior: "smooth" });
  }

  function clavier(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      versIndex(Math.min(personnes.length - 1, centre + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      versIndex(Math.max(0, centre - 1));
    }
  }

  return (
    <div className="w-44 shrink-0 select-none sm:w-52">
      <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        Personnel · {personnes.length}
      </p>
      <div className="relative">
        {/* Bande de surbrillance du centre. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border border-accent/40 bg-accent/[0.08]"
          style={{ height: H_ITEM }}
        />
        {/* Voiles d'estompe haut et bas. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-[var(--background)] to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-[var(--background)] to-transparent" />

        <div
          ref={bande}
          role="listbox"
          aria-label="Choisir la personne affichée"
          aria-activedescendant={personnes[centre] ? `roue-${personnes[centre].id}` : undefined}
          tabIndex={0}
          onScroll={surDefilement}
          onKeyDown={clavier}
          className="relative h-80 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          style={{ perspective: 900, scrollbarWidth: "none" }}
        >
          {/* Marges fantômes : le premier et le dernier nom peuvent se centrer. */}
          <div style={{ height: `calc(50% - ${H_ITEM / 2}px)` }} aria-hidden="true" />
          {personnes.map((p, i) => {
            const delta = i - centre;
            const abs = Math.min(Math.abs(delta), 4);
            const actif = i === centre;
            return (
              <button
                key={p.id}
                id={`roue-${p.id}`}
                type="button"
                role="option"
                aria-selected={actif}
                onClick={() => versIndex(i)}
                className={cn(
                  "flex w-full snap-center items-center gap-2 px-2 text-left transition-[opacity,transform] duration-100",
                  actif ? "opacity-100" : abs === 1 ? "opacity-60" : abs === 2 ? "opacity-35" : "opacity-15",
                )}
                style={{
                  height: H_ITEM,
                  transform: `rotateX(${delta * -14}deg) scale(${actif ? 1 : 1 - abs * 0.06})`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: teinteAvatar(p.nom) }}
                >
                  {initiales(p.nom)}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm", actif && "font-semibold text-accent")}>
                    {p.nom}
                  </span>
                  {p.statut === "prestataire" && (
                    <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                      Prestataire
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <div style={{ height: `calc(50% - ${H_ITEM / 2}px)` }} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Faites tourner, ou cliquez un nom : son planning s&apos;affiche.
      </p>
    </div>
  );
}
