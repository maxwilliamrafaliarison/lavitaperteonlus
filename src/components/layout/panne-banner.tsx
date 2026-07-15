import { AlertOctagon } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";

/**
 * Bandeau de PANNE — à ne jamais confondre avec un état vide.
 *
 * Une donnée absente et une donnée injoignable se ressemblent à l'écran et
 * appellent deux réactions opposées : « le stock est à zéro, il faut
 * commander » contre « la base est tombée, il ne faut RIEN saisir ».
 *
 * Avant ce composant, une panne Supabase s'affichait au comptoir comme
 * « Aucun produit » : le pharmacien pouvait enregistrer des ventes dans le
 * vide, ticket imprimé à l'appui. Une panne doit se voir comme une panne.
 *
 * `role="alert"` : les lecteurs d'écran l'annoncent immédiatement, sans
 * attendre que l'utilisateur atteigne le bandeau.
 */
export function PanneBanner({
  titre,
  consigne,
  detail,
}: {
  titre: string;
  consigne: string;
  /** Message technique — utile au dépannage, inutile au comptoir. */
  detail?: string;
}) {
  return (
    <GlassCard
      role="alert"
      className="border-primary/40 bg-primary/10 p-5 flex items-start gap-4"
    >
      <AlertOctagon className="size-6 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-primary">{titre}</h2>
        <p className="mt-1 text-sm leading-relaxed">{consigne}</p>
        {detail && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground break-words">
            {detail}
          </p>
        )}
      </div>
    </GlassCard>
  );
}
