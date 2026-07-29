"use client";

import * as React from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";

import { changerMotDePasseAction } from "./actions";

export function FormulaireChangement() {
  const [loading, setLoading] = React.useState(false);

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // En cas de succès, l'action redirige vers /login (déconnexion) : on
      // ne repasse ici qu'en cas d'erreur.
      const r = await changerMotDePasseAction(new FormData(e.currentTarget));
      if (r && !r.ok && r.error) {
        toast.error("Impossible", { description: r.error });
        setLoading(false);
      }
    } catch {
      // Le redirect de next/navigation se propage par une exception : ne pas
      // la traiter comme une erreur.
    }
  }

  const champ =
    "h-11 w-full rounded-xl glass border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Mot de passe actuel (provisoire)
        </span>
        <input name="actuel" type="password" required autoComplete="current-password" className={champ} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Nouveau mot de passe
        </span>
        <input name="nouveau" type="password" required minLength={8} autoComplete="new-password" className={champ} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Confirmation
        </span>
        <input name="confirmation" type="password" required minLength={8} autoComplete="new-password" className={champ} />
      </label>
      <GlassButton type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        Enregistrer et se reconnecter
      </GlassButton>
    </form>
  );
}
