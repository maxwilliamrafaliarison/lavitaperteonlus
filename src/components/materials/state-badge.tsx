import type { MaterialState } from "@/types";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<MaterialState, { fr: string; it: string }> = {
  operationnel: { fr: "Opérationnel", it: "Operativo" },
  en_panne: { fr: "En panne", it: "Guasto" },
  obsolete: { fr: "Obsolète", it: "Obsoleto" },
  en_reparation: { fr: "En réparation", it: "In riparazione" },
  hors_service: { fr: "Hors service", it: "Fuori servizio" },
};

const STATE_STYLES: Record<MaterialState, string> = {
  operationnel:
    "border-[var(--success)/30] bg-[oklch(0.75_0.18_150_/_0.10)] text-[var(--success)]",
  en_panne: "border-primary/30 bg-primary/10 text-primary",
  obsolete: "border-primary/40 bg-primary/12 text-primary",
  en_reparation:
    "border-[var(--warning)/30] bg-[oklch(0.82_0.16_85_/_0.10)] text-[var(--warning)]",
  hors_service: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function StateBadge({
  state,
  lang = "fr",
  size = "md",
  className,
}: {
  state: MaterialState;
  lang?: "fr" | "it";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 h-5 text-[10px]" : "px-2.5 h-6 text-[11px]",
        STATE_STYLES[state],
        className,
      )}
    >
      {STATE_LABELS[state][lang]}
    </span>
  );
}
