import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ShoppingCart, Banknote, PackagePlus, WifiOff, AlertTriangle, FileDown, Phone,
} from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aide — Pharmacie" };

/* ============================================================
   AIDE — le mode d'emploi du comptoir, dans l'application
   ============================================================
   Écrit pour la dispensatrice, cliente en face : phrases courtes, gestes
   concrets, zéro jargon. La règle d'or en cas de doute figure en premier —
   c'est celle qu'on cherche quand on panique.
   ============================================================ */

export default async function AidePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const estDirection = can(session.user.role, "pointage:lire");

  return (
    <main id="main-content" className="mx-auto max-w-3xl flex-1 p-4 md:p-10 space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Aide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le mode d&apos;emploi du comptoir. En cas de doute : mieux vaut demander que deviner.
        </p>
      </div>

      {/* La règle d'or, en tête. */}
      <GlassCard className="border-warning/30 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-warning">
          <WifiOff className="size-4" aria-hidden="true" />
          Si l&apos;application ne répond plus
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Continuez à servir : notez chaque vente dans le <strong>carnet papier</strong> (produit, quantité, montant, heure).</li>
          <li>N&apos;enregistrez <strong>rien deux fois</strong> — si vous ne savez pas si la vente est passée, vérifiez dans « Ventes » une fois le réseau revenu.</li>
          <li>Prévenez l&apos;informatique. Les ventes du carnet seront ressaisies ensuite : rien n&apos;est perdu.</li>
        </ol>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShoppingCart className="size-4 text-accent" aria-hidden="true" />
          Faire une vente
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Menu <strong>Nouvelle vente</strong> (le bouton rouge).</li>
          <li>Tapez les premières lettres du produit, choisissez-le dans la liste.</li>
          <li>Indiquez la quantité — pour un produit vendu à l&apos;unité (pastille), la quantité est en <strong>unités</strong>, pas en boîtes.</li>
          <li>Ajoutez les autres produits, puis <strong>Encaisser</strong>.</li>
          <li>Le ticket s&apos;imprime ou se télécharge — remettez-le au client.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Prise en charge (PEC) : choisissez « Prise en charge » au moment d&apos;encaisser et
          l&apos;entité qui paie — le client ne paie rien, la vente est tracée.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Banknote className="size-4 text-accent" aria-hidden="true" />
          La caisse
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Le total encaissé du jour est visible sur le <strong>Tableau de bord</strong> et dans « Ventes ».</li>
          <li>Une erreur de saisie ? La vente peut être <strong>annulée</strong> depuis son détail — l&apos;annulation est tracée, le stock revient.</li>
          <li>Un rapport de fin de journée part automatiquement chaque soir à la direction.</li>
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <PackagePlus className="size-4 text-accent" aria-hidden="true" />
          Le stock
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li><strong>Réception</strong> : à chaque arrivée de produits, enregistrez le lot (quantité, péremption). Le stock se met à jour tout seul.</li>
          <li><strong>Transfert</strong> : pour passer des boîtes du gros au détail (vente à l&apos;unité).</li>
          <li>Les pastilles du menu vous préviennent : <span className="text-red-500 font-medium">rouge</span> = ruptures, <span className="text-amber-500 font-medium">ambre</span> = péremptions sous 90 jours.</li>
          <li>La sortie suit toujours le lot qui périme en premier — c&apos;est automatique.</li>
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <AlertTriangle className="size-4 text-accent" aria-hidden="true" />
          Les cas particuliers
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Produit introuvable à la recherche : vérifiez l&apos;orthographe, puis le Tableau de bord (peut-être en rupture).</li>
          <li>Produit périmé : ne le vendez pas — signalez-le pour retrait.</li>
          <li>Mot de passe oublié : voyez l&apos;administrateur, qui le réinitialise.</li>
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <FileDown className="size-4 text-accent" aria-hidden="true" />
          Aide-mémoire à imprimer
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Une page A4 à afficher au comptoir.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/api/pharmacie/aide-memoire/dispensatrice"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/12 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            <FileDown className="size-4" aria-hidden="true" />
            Aide-mémoire dispensatrice (PDF)
          </a>
          {estDirection && (
            <a
              href="/api/pharmacie/aide-memoire/direction"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-glass-border px-4 py-2 text-sm hover:bg-white/5 transition-colors"
            >
              <FileDown className="size-4" aria-hidden="true" />
              Aide-mémoire direction (PDF)
            </a>
          )}
        </div>
      </GlassCard>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Phone className="size-3" aria-hidden="true" />
        Support : informatique.lavitaperte@gmail.com
      </p>
    </main>
  );
}
