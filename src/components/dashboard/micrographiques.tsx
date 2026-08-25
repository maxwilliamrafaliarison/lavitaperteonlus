/* ============================================================
   MICROGRAPHIQUES — les primitives visuelles du tableau de bord
   ============================================================

   Trois formes, et trois seulement. Une page qui multiplie les types de
   graphiques oblige l'œil à réapprendre à lire à chaque bloc ; celle-ci
   emploie partout les mêmes, si bien qu'on les lit sans y penser dès le
   deuxième usage.

   ── POURQUOI PAS DE CADRAN NI DE CAMEMBERT ───────────────────────────────
   Stephen Few a conçu le « bullet graph » en 2005 précisément contre le
   cadran, auquel il reproche d'« afficher trop peu d'information, d'occuper
   trop de place et d'être encombré de décorations inutiles ». Le reproche
   vise mot pour mot ce que faisait notre « 81/100 » : un chiffre seul, sans
   échelle, sans seuil, sur une carte entière.

   La barre à repère met TROIS choses dans la hauteur d'une ligne de texte :
   la mesure, le seuil qu'elle doit atteindre, et les paliers qui disent si
   elle est bonne. On peut alors en aligner dix les unes sous les autres et
   comparer d'un regard, ce qu'aucune juxtaposition de cadrans ne permet.

   ── POURQUOI CES DIMENSIONS ──────────────────────────────────────────────
   Datadog chiffre la règle que presque personne n'écrit : sous un tiers de
   la largeur, un graphique à axes devient illisible. Il n'y a rien d'utile
   entre « au moins quatre colonnes sur douze » et « pas d'axes du tout ».
   Ces trois formes sont du second genre : aucune n'a d'axe, aucune n'a de
   légende, chacune tient dans une ligne et se lit par sa position.
   ============================================================ */

import { cn } from "@/lib/utils";

/** Teinte sémantique. Jamais décorative : elle dit un état, pas une catégorie. */
export type Ton = "bon" | "vigilance" | "critique" | "neutre";

const FOND: Record<Ton, string> = {
  bon: "bg-[var(--success)]",
  vigilance: "bg-[var(--warning)]",
  critique: "bg-[var(--danger)]",
  neutre: "bg-foreground/25",
};

const TEXTE: Record<Ton, string> = {
  bon: "text-[var(--success)]",
  vigilance: "text-[var(--warning)]",
  critique: "text-[var(--danger)]",
  neutre: "text-muted-foreground",
};

export const tonDuScore = (score: number): Ton =>
  score >= 70 ? "bon" : score >= 40 ? "vigilance" : "critique";

/**
 * BARRE À REPÈRE. La mesure, son seuil, et les paliers de fond.
 *
 * Le seuil est un trait perpendiculaire, pas une couleur : on voit d'un coup
 * si la barre le franchit, et l'information survit à l'impression en noir et
 * blanc comme au daltonisme.
 */
export function BarreRepere({
  valeur,
  max = 100,
  seuil,
  ton,
  className,
}: {
  valeur: number;
  max?: number;
  /** Valeur à atteindre, matérialisée par un trait. */
  seuil?: number;
  ton?: Ton;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (valeur / max) * 100));
  const t = ton ?? tonDuScore((valeur / max) * 100);
  return (
    <div className={cn("relative h-2 rounded-sm bg-foreground/[0.07]", className)}>
      {/* Paliers : trois intensités d'une même absence de couleur, pour ne
          pas concurrencer la mesure elle-même. */}
      <div className="absolute inset-y-0 left-0 w-[40%] rounded-l-sm bg-foreground/[0.05]" />
      <div className="absolute inset-y-0 left-[40%] w-[30%] bg-foreground/[0.03]" />
      <div className={cn("absolute inset-y-0 left-0 rounded-sm", FOND[t])} style={{ width: `${pct}%` }} />
      {seuil !== undefined && (
        <div
          className="absolute inset-y-[-2px] w-px bg-foreground/70"
          style={{ left: `${Math.max(0, Math.min(100, (seuil / max) * 100))}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * BARRE EMPILÉE. Une répartition en une ligne, sans légende séparée.
 *
 * Elle remplace le camembert : les proportions se lisent aussi bien, la
 * comparaison entre deux lignes devient possible, et la place occupée passe
 * d'un tiers de page à la hauteur d'un texte.
 */
export function BarreEmpilee({
  segments,
  hauteur = "h-2",
  className,
}: {
  segments: Array<{ valeur: number; ton: Ton; libelle: string }>;
  hauteur?: string;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.valeur, 0) || 1;
  return (
    <div className={cn("flex overflow-hidden rounded-sm", hauteur, className)}>
      {segments
        .filter((s) => s.valeur > 0)
        .map((s) => (
          <div
            key={s.libelle}
            className={FOND[s.ton]}
            style={{ width: `${(s.valeur / total) * 100}%` }}
            title={`${s.libelle} : ${s.valeur}`}
          />
        ))}
    </div>
  );
}

/**
 * PASTILLE DE LÉGENDE. Le carré de couleur ET le mot, jamais l'un sans
 * l'autre : la couleur seule exclut ceux qui la distinguent mal et ne
 * survit pas à une photocopie.
 */
export function Pastille({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("size-2 rounded-[2px]", FOND[ton])} aria-hidden="true" />
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}

/**
 * MESURE. Un nombre et son étiquette, dans le rapport de taille qui convient.
 *
 * Vingt-quatre pixels en graisse 600, pas trente : chez Linear, le plus gros
 * texte d'un écran de travail fait dix-sept pixels, et la hiérarchie passe
 * par la GRAISSE et par quatre niveaux de gris. Un nombre énorme n'informe
 * pas mieux, il occupe seulement plus de place.
 */
export function Mesure({
  etiquette,
  valeur,
  detail,
  ton = "neutre",
  children,
}: {
  etiquette: string;
  valeur: string;
  detail?: string;
  ton?: Ton;
  /** Micrographique posé sous la valeur. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {etiquette}
      </p>
      <p
        className={cn(
          "font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]",
          ton !== "neutre" && TEXTE[ton],
        )}
      >
        {valeur}
      </p>
      {children}
      {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
