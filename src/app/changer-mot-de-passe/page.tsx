import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { auth } from "@/auth";
import { GlassCard } from "@/components/glass/glass-card";

import { FormulaireChangement } from "./formulaire";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choisir votre mot de passe" };

/**
 * Étape obligée des comptes livrés avec un mot de passe provisoire : le
 * middleware conduit ici et n'ouvre rien d'autre tant que la personne n'a
 * pas choisi le sien. La page reste accessible hors obligation (changement
 * volontaire).
 */
export default async function ChangerMotDePassePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <GlassCard className="p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
            <KeyRound className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            Choisissez votre mot de passe
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.user.name ? `${session.user.name}, votre` : "Votre"} mot de passe actuel est
            provisoire : il a été communiqué par l&apos;administration et doit rester connu de vous
            seul·e. Choisissez le vôtre pour continuer.
          </p>
        </div>
        <FormulaireChangement />
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          8 caractères minimum, avec au moins une lettre et un chiffre. Vous serez ensuite
          reconnecté·e avec votre nouveau mot de passe.
        </p>
      </GlassCard>
    </main>
  );
}
