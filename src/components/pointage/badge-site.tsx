import { Building2, Hospital, Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================
   PASTILLES D'IDENTIFICATION — centre et statut
   ============================================================
   Trois populations cohabitent dans tous les écrans (présence, états,
   planning, corrections) et se confondent vite : personnel REX, personnel
   MIARAKA, prestataires. La distinction n'est pas cosmétique — le statut
   « prestataire » déclenche la règle LIM et un mode de rémunération
   différent. Ces pastilles sont donc la même partout, dans la continuité
   de « Prép. LG » côté pharmacie.

   Accessibilité : la couleur n'est jamais le seul porteur d'information —
   chaque pastille porte un texte et une icône (WCAG 1.4.1).
   ============================================================ */

type Site = "REX" | "MIARAKA" | string;

const SITES: Record<string, { label: string; classe: string; Icone: typeof Building2 }> = {
  REX: {
    label: "REX",
    // Ambre : distinct de l'accent violet de l'app et du vert MIARAKA.
    classe:
      "border-[oklch(0.72_0.16_70_/_0.35)] bg-[oklch(0.72_0.16_70_/_0.12)] text-[oklch(0.55_0.16_70)] dark:text-[oklch(0.80_0.15_70)]",
    Icone: Hospital,
  },
  MIARAKA: {
    label: "MIARAKA",
    classe:
      "border-[oklch(0.70_0.16_155_/_0.35)] bg-[oklch(0.70_0.16_155_/_0.12)] text-[oklch(0.50_0.15_155)] dark:text-[oklch(0.78_0.15_155)]",
    Icone: Building2,
  },
};

/** Pastille du centre de rattachement. */
export function BadgeSite({ site, className }: { site: Site; className?: string }) {
  const s = SITES[String(site).toUpperCase()];
  if (!s) return null;
  const { label, classe, Icone } = s;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        classe,
        className,
      )}
      title={`Centre ${label}`}
    >
      <Icone className="size-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Pastille « Prestataire ». Rien n'est affiché pour un salarié : marquer la
 * norme alourdirait chaque ligne sans rien apprendre. On ne signale que
 * l'exception, qui elle a des conséquences (facturation horaire, règle LIM).
 */
export function BadgeStatut({ statut, className }: { statut: string; className?: string }) {
  if (statut !== "prestataire") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        "border-[oklch(0.62_0.19_300_/_0.35)] bg-[oklch(0.62_0.19_300_/_0.12)]",
        "text-[oklch(0.55_0.2_300)] dark:text-[oklch(0.75_0.18_300)]",
        className,
      )}
      title="Prestataire : facturé à l'heure, entrée plafonnée à 7:50 / 13:50"
    >
      <Briefcase className="size-2.5" aria-hidden="true" />
      Prestataire
    </span>
  );
}

/** Les deux pastilles côte à côte, usage courant dans les tableaux. */
export function BadgesAgent({
  site,
  statut,
  className,
}: {
  site: string;
  statut: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <BadgeSite site={site} />
      <BadgeStatut statut={statut} />
    </span>
  );
}
