"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2, Copy, Check, EyeOff, Send, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { BadgeSite } from "@/components/pointage/badge-site";
import { cn } from "@/lib/utils";

import { libelleStatut } from "@/lib/planning/validation";

import {
  creerPlanningAction,
  publierPlanningAction,
  revoquerLienAction,
  soumettreValidationAction,
  validerPlanningAction,
  renvoyerBrouillonAction,
} from "./actions";

export interface PlanningLigne {
  id: string;
  centre: string;
  du: string;
  au: string;
  libelle: string;
  statut: string;
  token: string;
  publieLe: string;
  note: string;
  nbAffectations: number;
}

/* ============================================================
   CRÉATION D'UN PLANNING
   ============================================================

   ── CE QUE LE FORMULAIRE DEMANDAIT ───────────────────────────────────────
   Un centre dans une liste déroulante, deux dates à saisir au clavier, un
   libellé à inventer. Quatre décisions pour un geste qui, en pratique, n'en
   comporte qu'une : « la semaine prochaine, à REX ».

   Les deux champs de date étaient le pire des quatre. Un plannning va du
   lundi au dimanche ; se tromper d'un jour décale toute la grille, et rien
   dans le formulaire ne le signalait. La personne qui s'en sert n'a pas à
   savoir quel jour tombe le lundi d'après.

   ── CE QU'IL DEMANDE MAINTENANT ──────────────────────────────────────────
   Le centre, en deux boutons visibles plutôt qu'une liste à dérouler. Puis
   la semaine, proposée : la PREMIÈRE qui n'est pas encore planifiée pour ce
   centre, celle d'après, ou des dates libres pour les cas particuliers
   (quinzaine, mois, remplacement ponctuel). Le libellé s'écrit tout seul.

   Le cas courant tient donc en un clic sur « Créer », et le cas rare reste
   atteignable sans quitter l'écran.
   ============================================================ */

/** Lundi de la semaine contenant `iso`. */
function lundi(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** `iso` décalé de `jours`. */
function decaler(iso: string, jours: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** « lun. 7 sept. » — assez court pour tenir dans un bouton. */
function jourCourt(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export function NouveauPlanning({ prochaines }: { prochaines: Record<string, string> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [centre, setCentre] = React.useState<"REX" | "MIARAKA">("REX");
  const [choix, setChoix] = React.useState<"1" | "2" | "libre">("1");

  /* La semaine proposée dépend du centre : REX et MIARAKA n'avancent pas au
     même rythme. Changer de centre change donc les deux dates, sans que la
     personne ait à y penser. */
  const base = prochaines[centre] || lundi(new Date().toISOString().slice(0, 10));
  const semaines = [
    { cle: "1" as const, du: base, au: decaler(base, 6) },
    { cle: "2" as const, du: decaler(base, 7), au: decaler(base, 13) },
  ];
  const retenue = semaines.find((s) => s.cle === choix);

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("centre", centre);
      if (retenue) {
        fd.set("du", retenue.du);
        fd.set("au", retenue.au);
      }
      const r = await creerPlanningAction(fd);
      if (r.ok) {
        const n = r.reprises ?? 0;
        toast.success("Planning créé", {
          description:
            n > 0
              ? `${n} affectation${n > 1 ? "s" : ""} reprise${n > 1 ? "s" : ""} de la semaine précédente. Ajustez ce qui change, puis publiez.`
              : "Grille vide : aucune semaine précédente à reprendre pour ce centre.",
        });
        setOuvert(false);
        /* On ouvre la grille du planning créé : créer sans ouvrir laisse la
           personne devant une liste, à chercher ce qu'elle vient de faire. */
        if (r.id) router.push(`/pointage/planning/${r.id}?vue=semaine`);
        else router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      // Une action serveur qui échoue au TRANSPORT (coupure, 502, session
      // expirée) rejette la promesse au lieu de rendre {ok:false}. Sans ce
      // filet, l'écran retire seulement le voyant : la personne croit avoir
      // agi, et rien n'est parti.
      toast.error("Le planning n'a pas été créé", {
        description:
          "La connexion a été interrompue. Vérifiez le réseau, puis recommencez.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!ouvert) {
    return (
      <GlassButton type="button" variant="brand" onClick={() => setOuvert(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Nouveau planning
      </GlassButton>
    );
  }

  return (
    <GlassCard className="w-full p-5">
      <form onSubmit={envoyer} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            1. Pour quel centre ?
          </legend>
          <div className="flex gap-2">
            {(["REX", "MIARAKA"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCentre(c)}
                aria-pressed={centre === c}
                className={cn(
                  "h-10 rounded-xl border px-4 text-sm font-medium transition-colors",
                  centre === c
                    ? "border-accent/50 bg-accent/12 text-accent"
                    : "border-glass-border text-muted-foreground hover:bg-white/5",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            2. Quelle période ?
          </legend>
          <div className="flex flex-wrap gap-2">
            {semaines.map((s, i) => (
              <button
                key={s.cle}
                type="button"
                onClick={() => setChoix(s.cle)}
                aria-pressed={choix === s.cle}
                className={cn(
                  "rounded-xl border px-4 py-2 text-left transition-colors",
                  choix === s.cle
                    ? "border-accent/50 bg-accent/12"
                    : "border-glass-border hover:bg-white/5",
                )}
              >
                <span className={cn("block text-sm font-medium", choix === s.cle && "text-accent")}>
                  {i === 0 ? "Prochaine semaine à planifier" : "La semaine d'après"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  du {jourCourt(s.du)} au {jourCourt(s.au)}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setChoix("libre")}
              aria-pressed={choix === "libre"}
              className={cn(
                "rounded-xl border px-4 py-2 text-left transition-colors",
                choix === "libre"
                  ? "border-accent/50 bg-accent/12"
                  : "border-glass-border hover:bg-white/5",
              )}
            >
              <span className={cn("block text-sm font-medium", choix === "libre" && "text-accent")}>
                Autres dates
              </span>
              <span className="block text-[11px] text-muted-foreground">
                quinzaine, mois, période particulière
              </span>
            </button>
          </div>

          {/* Les champs libres n'apparaissent que si on les demande : montrés
              en permanence, ils suggèrent qu'il faut les remplir. */}
          {choix === "libre" && (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-glass-border p-3">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Premier jour
                </span>
                <input name="du" type="date" required defaultValue={base} className="h-9 rounded-lg glass border px-2 text-sm font-mono" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Dernier jour
                </span>
                <input name="au" type="date" required defaultValue={decaler(base, 6)} className="h-9 rounded-lg glass border px-2 text-sm font-mono" />
              </label>
              <label className="block min-w-48 flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Nom (facultatif)
                </span>
                <input name="libelle" placeholder="Écrit tout seul si vous laissez vide" className="h-9 w-full rounded-lg glass border px-3 text-sm" />
              </label>
            </div>
          )}
        </fieldset>

        {/* Reprise cochée par défaut : une semaine ressemble à la
            précédente, et partir d'une grille vide oblige à ressaisir cent
            cinquante affectations pour en changer cinq. Décochable, parce
            qu'un report qu'on ne peut pas refuser n'est pas un service. */}
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            3. Point de départ
          </legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              name="reprendre"
              defaultChecked
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-sm">
              Reprendre la semaine précédente
              <span className="block text-[11px] text-muted-foreground">
                Les affectations du dernier planning de ce centre sont recopiées jour pour jour, le
                lundi sur un lundi. Rien n&apos;est publié : vous ajustez avant de diffuser.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="flex items-center gap-3 border-t border-glass-border pt-4">
          <GlassButton type="submit" variant="brand" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            Créer le planning
          </GlassButton>
          <button type="button" onClick={() => setOuvert(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">
            Annuler
          </button>
          {retenue && (
            <p className="text-[11px] text-muted-foreground">
              {centre}, du {jourCourt(retenue.du)} au {jourCourt(retenue.au)}
            </p>
          )}
        </div>
      </form>
    </GlassCard>
  );
}

/** Ligne de planning : publication, lien de consultation, révocation. */
export function PlanningRow({ p, origine, validateur }: { p: PlanningLigne; origine: string; validateur: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"" | "publier" | "revoquer" | "soumettre" | "valider" | "renvoyer">("");
  const [copie, setCopie] = React.useState(false);
  const lien = p.token ? `${origine}/planning/${p.token}` : "";

  async function agir(quoi: "publier" | "revoquer" | "soumettre" | "valider" | "renvoyer") {
    setLoading(quoi);
    try {
      const fd = new FormData();
      fd.set("id", p.id);
      if (quoi === "publier" || quoi === "valider") fd.set("token", p.token);
      if (quoi === "renvoyer") {
        const motif = window.prompt("Motif du renvoi en brouillon (transmis au préparateur) :") ?? "";
        fd.set("motif", motif);
      }
      const actions = {
        publier: publierPlanningAction,
        revoquer: revoquerLienAction,
        soumettre: soumettreValidationAction,
        valider: validerPlanningAction,
        renvoyer: renvoyerBrouillonAction,
      } as const;
      let r = await actions[quoi](fd);

      /* PASSER OUTRE, MAIS EN LE DISANT. Une semaine dont la garde de nuit
         ou l'accueil n'a personne peut devoir être publiée quand même —
         c'est parfois la réalité du centre. On demande alors POURQUOI, et
         la raison reste écrite sur le planning : une dérogation dont
         personne ne retrouve le motif six mois plus tard n'en est pas une. */
      if (!r.ok && "trous" in r && r.trous) {
        const motif = window.prompt(
          `Poste critique sans personne : ${r.trous}.\n\n` +
            "Publier quand même ? Indiquez pourquoi ce poste reste vide (la raison sera conservée sur le planning) :",
        );
        if (motif && motif.trim()) {
          fd.set("motif", motif.trim());
          r = await actions[quoi](fd);
        }
      }

      if (r.ok) {
        if ("avertissement" in r && r.avertissement) {
          toast.warning("À savoir", { description: r.avertissement, duration: 10000 });
        }
        toast.success(
          quoi === "publier" ? "Planning publié"
          : quoi === "revoquer" ? "Lien révoqué"
          : quoi === "soumettre" ? "Soumis à la validation de la direction"
          : quoi === "valider" ? "Validé et publié : le personnel peut consulter"
          : "Renvoyé en brouillon",
        );
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      // Une action serveur qui échoue au TRANSPORT (coupure, 502, session
      // expirée) rejette la promesse au lieu de rendre {ok:false}. Sans ce
      // filet, l'écran retire seulement le voyant : la personne croit avoir
      // agi, et rien n'est parti.
      /* L'action est connue ici : la nommer évite d'avoir à deviner ce
         qui a échoué, et surtout de republier par précaution un planning
         qui l'était peut-être déjà. */
      toast.error(
        quoi === "publier" ? "Le planning n'a pas été publié"
        : quoi === "revoquer" ? "Le lien n'a pas été révoqué"
        : quoi === "soumettre" ? "La soumission n'est pas partie"
        : quoi === "valider" ? "La validation n'est pas passée"
        : "Le renvoi en brouillon n'est pas passé",
        {
          description:
            "La connexion a été interrompue. Rechargez la page pour voir l'état réel avant de recommencer.",
        },
      );
    } finally {
      setLoading("");
    }
  }

  async function copier() {
    await navigator.clipboard.writeText(lien);
    setCopie(true);
    toast.success("Lien copié");
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <GlassCard className="p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BadgeSite site={p.centre} />
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                p.statut === "publie"
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : p.statut === "a_valider"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-glass-border text-muted-foreground",
              )}
            >
              {libelleStatut(p.statut)}
            </span>
          </div>
          <h3 className="mt-1.5 font-display text-base font-semibold">{p.libelle}</h3>
          <p className="text-xs text-muted-foreground">
            {p.du} → {p.au} · {p.nbAffectations} affectation(s)
            {p.publieLe && ` · publié le ${p.publieLe.slice(0, 10)}`}
          </p>
          {p.note && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{p.note}</p>}
        </div>
        <div className="flex gap-2">
          <a
            href={`/pointage/planning/${p.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Éditer
          </a>
          {/* Circuit : le préparateur SOUMET ; la direction VALIDE et publie. */}
          {p.statut !== "publie" && p.statut !== "a_valider" && !validateur && (
            <GlassButton type="button" size="sm" variant="brand" onClick={() => agir("soumettre")} disabled={loading !== ""}>
              {loading === "soumettre" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Soumettre à validation
            </GlassButton>
          )}
          {p.statut === "a_valider" && !validateur && (
            <span className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
              En attente de validation : Dr Elisa SALA
            </span>
          )}
          {p.statut === "a_valider" && validateur && (
            <>
              <GlassButton type="button" size="sm" variant="brand" onClick={() => agir("valider")} disabled={loading !== ""}>
                {loading === "valider" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                Valider et publier
              </GlassButton>
              <button
                type="button"
                onClick={() => agir("renvoyer")}
                disabled={loading !== ""}
                className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 text-xs text-muted-foreground hover:bg-white/5 transition-colors"
              >
                Renvoyer en brouillon
              </button>
            </>
          )}
          {validateur && p.statut !== "a_valider" && (
            <GlassButton type="button" size="sm" variant={p.statut === "publie" ? "ghost" : "brand"} onClick={() => agir("publier")} disabled={loading !== ""}>
              {loading === "publier" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              {p.statut === "publie" ? "Republier" : "Publier"}
            </GlassButton>
          )}
          {p.token && (
            <button
              type="button"
              onClick={() => agir("revoquer")}
              disabled={loading !== ""}
              title="Rend le lien inutilisable"
              className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 text-xs text-muted-foreground hover:bg-white/5 transition-colors"
            >
              <EyeOff className="size-3.5" aria-hidden="true" />
              Révoquer
            </button>
          )}
        </div>
      </div>

      {lien && (
        <div className="rounded-xl border border-glass-border bg-white/3 p-3">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <code className="flex-1 truncate font-mono text-xs">{lien}</code>
            <button
              type="button"
              onClick={copier}
              className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/12 px-2 py-1 text-xs text-accent hover:bg-accent/20 transition-colors"
            >
              {copie ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copie ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Lien privé, non référencé par les moteurs de recherche. À diffuser au personnel
            uniquement : il donne accès aux affectations nominatives.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
