"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";

import { ajouterFerieAction, supprimerFerieAction } from "../actions";

/* Les fêtes malgaches fixes, proposées d'un clic. Les mobiles (Pâques,
   Pentecôte) et les jours chômés décidés par le centre restent à saisir :
   aucune règle ne permet de les poser d'avance sans se tromper. */
const FIXES: Array<{ mmjj: string; libelle: string }> = [
  { mmjj: "01-01", libelle: "Jour de l'an" },
  { mmjj: "03-08", libelle: "Journée de la femme" },
  { mmjj: "03-29", libelle: "Fête des Martyrs" },
  { mmjj: "05-01", libelle: "Fête du Travail" },
  { mmjj: "06-26", libelle: "Fête de l'Indépendance" },
  { mmjj: "08-15", libelle: "Assomption" },
  { mmjj: "11-01", libelle: "Toussaint" },
  { mmjj: "12-25", libelle: "Noël" },
];

export function AjouterFerie({ annee, dejaPris }: { annee: number; dejaPris: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState("");
  const pris = new Set(dejaPris);
  // Les fêtes fixes se posent pour les deux centres : la clé est « jour| ».

  async function poser(jour: string, libelle: string, centre = "") {
    setLoading(jour);
    try {
      const fd = new FormData();
      fd.set("jour", jour);
      fd.set("libelle", libelle);
      fd.set("centre", centre);
      const r = await ajouterFerieAction(fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } finally {
      setLoading("");
    }
  }

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    setLoading("form");
    try {
      const r = await ajouterFerieAction(fd);
      if (r.ok) {
        toast.success(r.message);
        form.reset();
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Fêtes fixes de {annee}, à poser d&apos;un clic
        </p>
        <div className="flex flex-wrap gap-2">
          {FIXES.map((f) => {
            const jour = `${annee}-${f.mmjj}`;
            const posee = pris.has(jour);
            return (
              <button
                key={f.mmjj}
                type="button"
                disabled={posee || loading !== ""}
                onClick={() => poser(jour, f.libelle)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                  posee
                    ? "border-[var(--success)]/40 text-[var(--success)]"
                    : "border-glass-border text-muted-foreground hover:bg-white/5",
                  loading !== "" && !posee && "opacity-50",
                )}
              >
                {loading === jour ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : posee ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Plus className="size-3.5" aria-hidden="true" />
                )}
                {f.libelle}
                <span className="font-mono text-[11px] tabular-nums opacity-70">{f.mmjj}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={envoyer} className="flex flex-wrap items-end gap-3 border-t border-glass-border pt-4">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Date
          </span>
          <input name="jour" type="date" required className="h-10 rounded-lg glass border px-3 text-sm font-mono" />
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Nom du jour férié
          </span>
          <input
            name="libelle"
            required
            placeholder="Pâques, Pentecôte, jour chômé décidé par le centre…"
            className="h-10 w-full rounded-lg glass border px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Centre
          </span>
          <select name="centre" className="h-10 rounded-lg glass border px-2 text-sm">
            <option value="">Les deux</option>
            <option value="REX">REX</option>
            <option value="MIARAKA">MIARAKA</option>
          </select>
        </label>
        <GlassButton type="submit" variant="brand" disabled={loading !== ""}>
          {loading === "form" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Ajouter
        </GlassButton>
      </form>
    </div>
  );
}

export function SupprimerFerie({ jour, libelle, centre }: { jour: string; libelle: string; centre: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function supprimer() {
    const ou = centre ? ` pour ${centre}` : "";
    if (!window.confirm(`Retirer « ${libelle} » du ${jour}${ou} ?`)) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("jour", jour);
      fd.set("centre", centre);
      const r = await supprimerFerieAction(fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={supprimer}
      disabled={loading}
      aria-label={`Retirer ${libelle}`}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-glass-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      Retirer
    </button>
  );
}
