import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pastille « Préparation — labo galénique ». Teinte violette VOLONTAIREMENT
 * distincte de l'accent vert de la pharmacie : au comptoir comme dans le
 * stock, on distingue d'un coup d'œil une préparation maison d'une
 * spécialité industrielle. `compact` masque le texte (icône seule) pour les
 * tableaux denses.
 */
export function BadgeGalenique({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      title="Préparation du laboratoire galénique"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        "border-[oklch(0.62_0.19_300_/_0.35)] bg-[oklch(0.62_0.19_300_/_0.12)] text-[oklch(0.55_0.2_300)]",
        "dark:text-[oklch(0.72_0.19_300)]",
        className,
      )}
    >
      <FlaskConical className="size-3 shrink-0" aria-hidden="true" />
      {compact ? <span className="sr-only">Préparation labo galénique</span> : "Prép. LG"}
    </span>
  );
}
