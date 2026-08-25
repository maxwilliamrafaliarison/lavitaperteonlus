"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DownloadCloud, WifiOff, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";

/* ============================================================
   BOUTON DE COLLECTE — récupération directe depuis la pointeuse
   ============================================================
   L'application tourne sur Vercel, hors du réseau des centres : ni son
   serveur ni le navigateur ne peuvent joindre une pointeuse en TCP. Le
   bouton s'adresse donc à un AGENT LOCAL lancé sur un poste du centre
   (scripts/agent-pointeuse.mts), seul à pouvoir parler à l'appareil.

   Trois issues, distinguées parce qu'elles appellent trois gestes
   différents : agent absent (le lancer), pointeuse injoignable (se brancher
   au bon réseau), collecte réussie.
   ============================================================ */

const AGENT = "http://localhost:7331";

type Etat = "repos" | "test" | "collecte";

/**
 * MIARAKA n'est pas joignable par le réseau : ses pointages arrivent par
 * fichier, comme auparavant. Plutôt qu'un bouton de collecte qui échouerait
 * toujours, on renvoie directement vers l'import — dire « impossible » sans
 * indiquer la voie praticable ferait perdre du temps à chaque tentative.
 */
export function ImportMiaraka() {
  return (
    <div className="space-y-2">
      <Link
        href="/pointage/import?site=MIARAKA"
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-medium",
          "border border-glass-border hover:bg-white/5 transition-colors",
        )}
      >
        <FileSpreadsheet className="size-4" aria-hidden="true" />
        Importer un fichier : MIARAKA
      </Link>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <WifiOff className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          La pointeuse de MIARAKA n&apos;est pas accessible par le réseau : exportez ses
          pointages depuis ZKAccess, puis déposez le fichier ici.
        </span>
      </p>
    </div>
  );
}

export function BoutonCollecte({ site = "REX" }: { site?: string }) {
  const router = useRouter();
  const [etat, setEtat] = React.useState<Etat>("repos");
  const [resultat, setResultat] = React.useState<string>("");

  async function collecter() {
    setEtat("test");
    setResultat("");

    // 1. L'agent local répond-il ? Sans lui, rien n'est possible.
    let statut: Response;
    try {
      statut = await fetch(`${AGENT}/statut?site=${site}`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      setEtat("repos");
      toast.error("Agent de collecte introuvable", {
        description:
          `Ce poste n'exécute pas l'agent de collecte. Ouvrez un terminal sur un ordinateur branché au réseau du centre ${site} et lancez : npx tsx scripts/agent-pointeuse.mts`,
        duration: 12000,
      });
      return;
    }

    // 2. L'agent répond mais la pointeuse est hors d'atteinte.
    if (!statut.ok) {
      const info = await statut.json().catch(() => ({ detail: "" }));
      setEtat("repos");
      toast.error(`Vous n'êtes pas branché au réseau du centre ${site}`, {
        description:
          info.detail ||
          `La pointeuse du centre ${site} ne répond pas. Vérifiez que ce poste est bien connecté au réseau du centre et que l'appareil est allumé.`,
        duration: 12000,
      });
      return;
    }

    // 3. Collecte effective.
    setEtat("collecte");
    try {
      const r = await fetch(`${AGENT}/collecter?site=${site}`, {
        method: "POST",
        signal: AbortSignal.timeout(180000),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        toast.error("Collecte interrompue", { description: d.error ?? "Erreur inconnue.", duration: 10000 });
        return;
      }
      const msg = `${d.ajoutes} pointage(s) ajouté(s) · ${d.dejaPresents} déjà connus`;
      setResultat(`${msg}${d.du ? ` · ${d.du} → ${d.au}` : ""}`);
      toast.success(`Collecte terminée : centre ${site}`, {
        description:
          d.ajoutes > 0
            ? msg
            : "Aucun nouveau pointage : la base était déjà à jour. Relancer ne crée jamais de doublon.",
        duration: 8000,
      });
      router.refresh();
    } catch {
      toast.error("Collecte interrompue", {
        description: "L'agent n'a pas répondu à temps. La lecture de la mémoire peut être longue ; réessayez.",
      });
    } finally {
      setEtat("repos");
    }
  }

  const occupe = etat !== "repos";

  return (
    <div className="space-y-2">
      <GlassButton type="button" variant="brand" onClick={collecter} disabled={occupe}>
        {occupe ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <DownloadCloud className="size-4" aria-hidden="true" />
        )}
        {etat === "test"
          ? "Connexion à la pointeuse…"
          : etat === "collecte"
            ? "Récupération en cours…"
            : `Récupérer les pointages : ${site}`}
      </GlassButton>

      {resultat && (
        <p className="inline-flex items-center gap-1.5 text-xs text-accent">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {resultat}
        </p>
      )}

      <p className={cn("flex items-start gap-1.5 text-[11px] text-muted-foreground")}>
        <WifiOff className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          Nécessite d&apos;être branché au réseau du centre {site}, avec l&apos;agent de collecte
          lancé sur ce poste. Relancer la collecte ne crée jamais de doublon.
        </span>
      </p>
    </div>
  );
}
