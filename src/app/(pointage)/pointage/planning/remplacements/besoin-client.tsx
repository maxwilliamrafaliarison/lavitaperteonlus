"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { resumerCandidat, type Candidat } from "@/lib/planning/remplacement";

import { remplacerAction } from "../[id]/actions";

/* ============================================================
   UN POSTE À COUVRIR, ET SES REMPLAÇANTS POSSIBLES
   ============================================================

   ── TROIS NOMS, PAS CINQUANTE-HUIT ───────────────────────────────────────
   Le moteur classe tout le personnel. Les afficher tous ferait une page de
   six écrans où le premier nom, qui est presque toujours le bon, se perdrait
   au milieu de cinquante indisponibles. On montre donc les trois premiers,
   et le reste s'ouvre d'un clic pour qui veut vérifier.

   Ce repli n'est pas un masquage : les personnes indisponibles y figurent
   avec la raison écrite. Il arrive qu'on décide quand même, et devoir aller
   chercher la personne sur un autre écran serait pire que de la voir barrée.

   ── LA RAISON DU RANG EST TOUJOURS AFFICHÉE ──────────────────────────────
   Sous chaque nom, une phrase dit pourquoi il est là : « Libre, a tenu ce
   poste 34 fois, 21:00 planifiées cette semaine ». Une liste ordonnée sans
   justification demande de faire confiance ; celle-ci se vérifie.
   ============================================================ */

export interface BesoinVue {
  affectationId: string;
  planningId: string;
  planningLibelle: string;
  planningPublie: boolean;
  jour: string;
  jourLisible: string;
  posteLibelle: string;
  creneauLibelle: string;
  lieu: string;
  centre: string;
  motif: "poste_vide" | "absence";
  agentRemplaceNom: string;
  natureAbsence: string;
  candidats: Candidat[];
}

const APERCU = 3;

export function CarteBesoin({ b }: { b: BesoinVue }) {
  const router = useRouter();
  const [tousVisibles, setTousVisibles] = React.useState(false);
  const [enCours, setEnCours] = React.useState("");
  /* CONFIRMATION DANS LA LIGNE, ET NON DANS UNE BOÎTE DU NAVIGATEUR.
     À partir de la deuxième boîte native ouverte dans le même onglet,
     Chrome propose « empêcher cette page de créer des boîtes de dialogue ».
     Cochée, `window.confirm` rend false sans rien afficher : le bouton
     cesse de fonctionner en silence, et l'écran de remplacements est
     précisément celui où l'on confie plusieurs postes à la suite. */
  const [aConfirmer, setAConfirmer] = React.useState("");

  const visibles = tousVisibles ? b.candidats : b.candidats.slice(0, APERCU);
  const libres = b.candidats.filter((c) => c.disponible).length;

  async function confier(c: Candidat) {
    setAConfirmer("");
    setEnCours(c.agentId);
    try {
      const fd = new FormData();
      fd.set("affectationId", b.affectationId);
      fd.set("agentId", c.agentId);
      if (b.natureAbsence) fd.set("motif", b.natureAbsence);
      const r = await remplacerAction(fd);
      if (r.ok) {
        /* UN DÉPASSEMENT DE SEUIL NE S'ANNONCE PAS EN VERT. La première
           version rendait un toast de réussite dont le sous-texte gris
           portait « repos de 3:00 entre deux services » : la couleur disait
           que tout allait bien pendant que le texte disait le contraire, et
           c'est la couleur qu'on lit. Le geste a réussi, mais ce qu'il
           provoque doit se voir. */
        if (r.alertes.length) {
          toast.warning("Poste confié, mais un seuil est franchi", {
            description: `${r.message} ${r.alertes.join(" · ")}`,
            duration: 12000,
          });
        } else {
          toast.success(r.message, {
            description: b.planningPublie
              ? "Le planning est publié : les responsables sont prévenus."
              : undefined,
          });
        }
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      toast.error("Le remplacement n'est pas passé", {
        description:
          "La connexion a été interrompue. Rechargez la page pour voir l'état réel avant de recommencer.",
      });
    } finally {
      setEnCours("");
    }
  }

  return (
    <article className="rounded-2xl border border-glass-border">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-glass-border px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-display text-base font-semibold">{b.posteLibelle}</h3>
            <span className="text-sm text-muted-foreground">{b.creneauLibelle}</span>
            {b.lieu && <span className="text-xs text-muted-foreground">· {b.lieu}</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {b.jourLisible} · {b.centre}
            {b.motif === "absence" ? (
              <>
                {" · "}
                <span className="text-foreground">{b.agentRemplaceNom}</span> est en{" "}
                {b.natureAbsence.toLowerCase()}
              </>
            ) : (
              " · poste ouvert, sans titulaire"
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              b.motif === "poste_vide"
                ? "border-[var(--warning,#f5a623)]/40 text-[var(--warning,#f5a623)]"
                : "border-glass-border text-muted-foreground",
            )}
          >
            {b.motif === "poste_vide" ? "Personne" : "À remplacer"}
          </span>
          <Link
            href={`/pointage/planning/${b.planningId}?vue=semaine&debut=${b.jour}`}
            className="text-[11px] text-accent transition-colors hover:underline"
          >
            Voir la grille
          </Link>
        </div>
      </header>

      {b.candidats.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Personne n&apos;est rattaché à {b.centre} pour ce poste.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-glass-border">
            {visibles.map((c) => (
              <li
                key={c.agentId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-foreground/[0.02]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/pointage/agents/${c.agentId}`}
                      className={cn(
                        "truncate font-medium transition-colors hover:text-accent focus-visible:underline focus-visible:outline-none",
                        !c.disponible && "text-muted-foreground",
                      )}
                    >
                      {c.nom}
                    </Link>
                    {c.poste && (
                      <span className="truncate text-[11px] text-muted-foreground">{c.poste}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px]",
                      c.disponible ? "text-muted-foreground" : "text-[var(--danger,#e5484d)]",
                    )}
                  >
                    {resumerCandidat(c)}
                  </span>
                  {c.disponible && c.reserves.length > 0 && (
                    <span className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {c.reserves.join(" · ")}
                    </span>
                  )}
                </span>
                {aConfirmer === c.agentId ? (
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {b.motif === "absence"
                        ? `À la place de ${b.agentRemplaceNom} ?`
                        : "Confirmer ?"}
                    </span>
                    <button
                      type="button"
                      onClick={() => confier(c)}
                      disabled={enCours !== ""}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/20 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
                    >
                      {enCours === c.agentId ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      Oui, confier
                    </button>
                    <button
                      type="button"
                      onClick={() => setAConfirmer("")}
                      className="h-8 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Non
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAConfirmer(c.agentId)}
                    disabled={enCours !== ""}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors disabled:opacity-50",
                      c.disponible
                        ? "border-accent/40 bg-accent/12 text-accent hover:bg-accent/20"
                        : "border-glass-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.disponible ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <UserPlus className="size-3.5" aria-hidden="true" />
                    )}
                    {c.disponible ? "Confier" : "Confier quand même"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {b.candidats.length > APERCU && (
            <button
              type="button"
              onClick={() => setTousVisibles((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-glass-border px-5 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform", tousVisibles && "rotate-180")}
                aria-hidden="true"
              />
              {tousVisibles
                ? "Ne montrer que les trois premiers"
                : `Voir les ${b.candidats.length - APERCU} autres · ${libres} libre${libres > 1 ? "s" : ""} en tout`}
            </button>
          )}
        </>
      )}
    </article>
  );
}
