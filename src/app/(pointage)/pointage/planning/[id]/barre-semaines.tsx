"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { propagerSemaineAction } from "./actions";

/* ============================================================
   BARRE DES SEMAINES
   ============================================================

   Empruntée à EDT et PRONOTE Campus, où elle occupe le bas de l'écran en
   permanence : on y allume les semaines concernées, et ce qu'on fait
   au-dessus ne s'applique qu'à elles.

   Elle règle le geste que la DRH refait chaque semaine. Elle tient un
   roulement — une semaine type qui se répète — et le reportait à la main,
   semaine après semaine, dans un onglet Excel. Ici : on ouvre la semaine
   type, on allume les semaines à venir, on applique.

   ── CE QUE LA BARRE MONTRE D'ELLE-MÊME ──────────────────────────────────
   Chaque semaine porte son nombre d'affectations. Une semaine VIDE se voit
   donc d'un coup d'œil, sans avoir à l'ouvrir — c'est précisément ce qui
   manquait le 13 août, où personne n'avait remarqué que la semaine en cours
   n'existait pas et où l'écran des écarts affichait vingt-deux personnes
   « hors planning ».

   ── DEUX GESTES, PAS UN ─────────────────────────────────────────────────
   CLIQUER sur une semaine y va — c'est un lien, il marche sans JavaScript,
   il s'ouvre dans un onglet, il se met en favori. SÉLECTIONNER se fait par
   la case, et un clic avec Maj prend toute la plage : personne ne coche
   treize cases à la main.

   Les jours déjà planifiés ne sont jamais écrasés. Propager sur un
   trimestre ne doit pas effacer les ajustements qu'on y a faits.
   ============================================================ */

export interface SemaineBarre {
  /** Lundi de la semaine, "YYYY-MM-DD". */
  debut: string;
  /** Numéro ISO, tel qu'on le dit à l'oral : « la semaine 34 ». */
  numero: number;
  affectations: number;
  /**
   * URL de la semaine, calculée par le serveur.
   *
   * Elle est portée par la DONNÉE et non par une fonction passée en
   * propriété : une fonction ne franchit pas la frontière serveur/client,
   * et Next.js rompt le rendu — c'est exactement ce qui a mis la page en
   * erreur le 13 août. Ce qui traverse doit être sérialisable, toujours.
   */
  href: string;
}

export function BarreSemaines({
  planningId,
  semaines,
  courante,
  editable,
}: {
  planningId: string;
  semaines: SemaineBarre[];
  courante: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [choisies, setChoisies] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const dernier = React.useRef<string | null>(null);

  const basculer = (debut: string, avecMaj: boolean) => {
    setChoisies((p) => {
      const n = new Set(p);
      // Maj : on prend toute la plage depuis la dernière case touchée.
      if (avecMaj && dernier.current) {
        const i = semaines.findIndex((s) => s.debut === dernier.current);
        const j = semaines.findIndex((s) => s.debut === debut);
        if (i >= 0 && j >= 0) {
          for (const s of semaines.slice(Math.min(i, j), Math.max(i, j) + 1)) n.add(s.debut);
          return n;
        }
      }
      if (n.has(debut)) n.delete(debut);
      else n.add(debut);
      return n;
    });
    dernier.current = debut;
  };

  async function propager() {
    const cibles = [...choisies].filter((c) => c !== courante).sort();
    if (!cibles.length) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("source", courante);
      fd.set("cibles", cibles.join(","));
      const r = await propagerSemaineAction(fd);
      if (!r.ok) {
        toast.error("Propagation refusée", { description: r.error });
        return;
      }
      const copiees = r.resultats.reduce((n, x) => n + x.copiees, 0);
      const ignorees = r.resultats.reduce((n, x) => n + x.ignorees, 0);
      toast.success(
        copiees > 0
          ? `${copiees} affectation(s) posée(s) sur ${cibles.length} semaine(s)` +
              (ignorees ? ` · ${ignorees} jour(s) déjà planifié(s) préservé(s)` : "")
          : "Rien à poser : ces semaines étaient déjà planifiées.",
      );
      setChoisies(new Set());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const aPropager = [...choisies].filter((c) => c !== courante).length;

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex items-center gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Semaines</p>
        {editable && aPropager > 0 && (
          <>
            <button
              type="button"
              onClick={propager}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/15 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CopyPlus className="size-3.5" aria-hidden="true" />
              )}
              Appliquer cette semaine à {aPropager} semaine{aPropager > 1 ? "s" : ""}
            </button>
            <button
              type="button"
              onClick={() => setChoisies(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Tout décocher
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {semaines.map((s) => {
          const estCourante = s.debut === courante;
          const cochee = choisies.has(s.debut);
          return (
            <div
              key={s.debut}
              className={cn(
                "flex flex-col items-center rounded-lg border px-2 py-1 transition-colors",
                estCourante
                  ? "border-accent bg-accent/15"
                  : cochee
                    ? "border-accent/50 bg-accent/5"
                    : "border-glass-border hover:bg-foreground/5",
              )}
            >
              <a
                href={s.href}
                title={`Semaine du ${s.debut} · ${s.affectations} affectation(s)`}
                className={cn(
                  "text-xs font-medium tabular-nums",
                  estCourante ? "text-accent" : s.affectations === 0 ? "text-[var(--warning)]" : "",
                )}
              >
                S{s.numero}
              </a>
              {/* Une semaine vide se voit sans qu'on l'ouvre : le tiret
                  double la couleur, pour l'impression et pour les yeux qui
                  distinguent mal l'ambre du gris. */}
              <span className="text-[9px] leading-none text-muted-foreground tabular-nums">
                {s.affectations === 0 ? "—" : s.affectations}
              </span>
              {editable && (
                <input
                  type="checkbox"
                  checked={cochee}
                  onChange={(e) =>
                    basculer(s.debut, (e.nativeEvent as MouseEvent).shiftKey === true)
                  }
                  onClick={(e) => {
                    if (e.shiftKey) {
                      e.preventDefault();
                      basculer(s.debut, true);
                    }
                  }}
                  aria-label={`Sélectionner la semaine ${s.numero}`}
                  className="mt-0.5 size-3 accent-[var(--accent)]"
                />
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <p className="text-[11px] text-muted-foreground">
          Cliquer sur un numéro ouvre la semaine ; cocher la sélectionne, et un clic avec Maj prend
          toute la plage. Les jours déjà planifiés sont préservés : propager n&apos;écrase jamais un
          ajustement. Un tiret signale une semaine encore vide.
        </p>
      )}
    </div>
  );
}
