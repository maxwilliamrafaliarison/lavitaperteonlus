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

/** Formulaire de création d'un planning. */
export function NouveauPlanning() {
  const router = useRouter();
  const [ouvert, setOuvert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await creerPlanningAction(new FormData(e.currentTarget));
      if (r.ok) {
        toast.success("Planning créé");
        setOuvert(false);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
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
    <GlassCard className="p-5">
      <form onSubmit={envoyer} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Centre</span>
          <select name="centre" className="h-9 rounded-lg glass border px-2 text-sm">
            <option value="REX">REX</option>
            <option value="MIARAKA">MIARAKA</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Du</span>
          <input name="du" type="date" required className="h-9 rounded-lg glass border px-2 text-sm font-mono" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Au</span>
          <input name="au" type="date" required className="h-9 rounded-lg glass border px-2 text-sm font-mono" />
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Libellé</span>
          <input name="libelle" placeholder="Planning de travail du…" className="h-9 w-full rounded-lg glass border px-3 text-sm" />
        </label>
        <GlassButton type="submit" variant="brand" size="sm" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          Créer
        </GlassButton>
        <button type="button" onClick={() => setOuvert(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">
          Annuler
        </button>
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
      const r = await actions[quoi](fd);
      if (r.ok) {
        if ("avertissement" in r && r.avertissement) {
          toast.warning("Notification non envoyée", { description: r.avertissement, duration: 10000 });
        }
        toast.success(
          quoi === "publier" ? "Planning publié"
          : quoi === "revoquer" ? "Lien révoqué"
          : quoi === "soumettre" ? "Soumis à la validation de la direction"
          : quoi === "valider" ? "Validé et publié — le personnel peut consulter"
          : "Renvoyé en brouillon",
        );
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
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
              En attente de validation — Dr Elisa SALA
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
            uniquement — il donne accès aux affectations nominatives.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
