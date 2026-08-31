"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { majCompteurAction } from "./actions";

/* ============================================================
   FIXER LE DROIT À CONGÉS D'UNE PERSONNE
   ============================================================

   Deux valeurs ne se calculent pas et doivent être saisies : la date
   d'entrée, antérieure à l'application, et le report des registres papier.
   Sans elles, aucun solde ne peut être affiché, et le module tout entier
   reste décoratif.

   ── POURQUOI CE FORMULAIRE VIT DANS LE TABLEAU ───────────────────────────
   Il y a cinquante-huit personnes à renseigner une première fois. Un écran
   séparé imposerait cinquante-huit allers-retours ; une ligne qui s'ouvre
   sur place permet de descendre le tableau une fois, du haut vers le bas.

   La date de sortie ferme l'acquisition. Vide, elle se lit « toujours en
   poste » : c'est le cas de presque tout le monde, et on ne demande donc
   rien de plus au cas courant.
   ============================================================ */

export function DroitConges({
  agentId,
  agentNom,
  dateEntree,
  dateSortie,
  reporte,
}: {
  agentId: string;
  agentNom: string;
  dateEntree: string;
  dateSortie: string;
  reporte: number;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("agentId", agentId);
      const r = await majCompteurAction(fd);
      if (r.ok) {
        toast.success(r.message, { description: agentNom });
        setOuvert(false);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      toast.error("Rien n'a été enregistré", {
        description: "La connexion a été interrompue. Vérifiez le réseau, puis recommencez.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-glass-border px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="size-3" aria-hidden="true" />
        {dateEntree ? "Modifier" : "Saisir l'entrée"}
      </button>
    );
  }

  return (
    <form onSubmit={envoyer} className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-0.5 block text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Entrée
        </span>
        <input
          name="dateEntree"
          type="date"
          defaultValue={dateEntree}
          required
          className="h-8 rounded-lg glass border px-2 font-mono text-xs"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Sortie
        </span>
        <input
          name="dateSortie"
          type="date"
          defaultValue={dateSortie}
          className="h-8 rounded-lg glass border px-2 font-mono text-xs"
        />
      </label>
      <label className="block w-20">
        <span className="mb-0.5 block text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Report
        </span>
        <input
          name="reporte"
          type="text"
          inputMode="decimal"
          defaultValue={String(reporte).replace(".", ",")}
          className="h-8 w-full rounded-lg glass border px-2 text-right font-mono text-xs"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-accent/40 bg-accent/12 px-2.5 text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
        Enregistrer
      </button>
      <button
        type="button"
        onClick={() => setOuvert(false)}
        className="h-8 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Annuler
      </button>
    </form>
  );
}
