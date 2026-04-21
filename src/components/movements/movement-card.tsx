import Link from "next/link";
import {
  ArrowRightLeft, Sparkles, Wrench, Trash2, RotateCcw,
  Building2, DoorOpen, User as UserIcon,
  type LucideIcon,
} from "lucide-react";

import type { Movement, MovementType, Site, Room } from "@/types";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MOVEMENT_META: Record<
  MovementType,
  { icon: LucideIcon; tone: "primary" | "success" | "warning" | "muted" | "cyan" }
> = {
  creation: { icon: Sparkles, tone: "success" },
  transfert_site: { icon: Building2, tone: "primary" },
  transfert_salle: { icon: DoorOpen, tone: "cyan" },
  transfert_utilisateur: { icon: UserIcon, tone: "cyan" },
  reparation: { icon: Wrench, tone: "warning" },
  mise_au_rebut: { icon: Trash2, tone: "primary" },
  restauration: { icon: RotateCcw, tone: "success" },
};

const TONE_STYLES = {
  primary: "bg-primary/12 text-primary border-primary/30",
  success:
    "bg-[oklch(0.75_0.18_150_/_0.12)] text-[oklch(0.75_0.18_150)] border-[oklch(0.75_0.18_150_/_0.3)]",
  warning:
    "bg-[oklch(0.82_0.16_85_/_0.12)] text-[oklch(0.82_0.16_85)] border-[oklch(0.82_0.16_85_/_0.3)]",
  muted: "bg-muted text-muted-foreground border-glass-border",
  cyan: "bg-accent/12 text-accent border-accent/30",
};

export interface MovementCardProps {
  movement: Movement;
  siteMap: Map<string, Site>;
  roomMap: Map<string, Room>;
  materialLabel?: string;
  userLabel?: string;
  showMaterialLink?: boolean;
  lang?: Lang;
}

export function MovementCard({
  movement,
  siteMap,
  roomMap,
  materialLabel,
  userLabel,
  showMaterialLink = false,
  lang = "fr",
}: MovementCardProps) {
  const t = getT(lang);
  const meta = MOVEMENT_META[movement.type] ?? MOVEMENT_META.creation;
  const Icon = meta.icon;
  const label = t(`movement_types.${movement.type}`);

  const fromSite = movement.fromSiteId ? siteMap.get(movement.fromSiteId) : null;
  const fromRoom = movement.fromRoomId ? roomMap.get(movement.fromRoomId) : null;
  const toSite = movement.toSiteId ? siteMap.get(movement.toSiteId) : null;
  const toRoom = movement.toRoomId ? roomMap.get(movement.toRoomId) : null;

  // Résumé localisation : "Site A / Salle 03 → Site B / Salle 07"
  const formatLocation = (
    site: Site | null | undefined,
    room: Room | null | undefined,
    assignedTo?: string,
  ): string => {
    const parts = [];
    if (site) parts.push(site.code);
    if (room) parts.push(room.name);
    if (assignedTo) parts.push(`👤 ${assignedTo}`);
    return parts.join(" · ") || "—";
  };

  const from = formatLocation(fromSite, fromRoom, movement.fromAssignedTo);
  const to = formatLocation(toSite, toRoom, movement.toAssignedTo);

  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl border shrink-0",
          TONE_STYLES[meta.tone],
        )}
      >
        <Icon className="size-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{label}</span>
          {showMaterialLink && materialLabel && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <Link
                href={`/materials/${movement.materialId}`}
                className="text-xs font-medium hover:text-primary transition-colors truncate"
              >
                {materialLabel}
              </Link>
            </>
          )}
        </div>

        {movement.type !== "creation" ? (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="truncate">{from}</span>
            <ArrowRightLeft className="size-3 shrink-0" />
            <span className="truncate text-foreground/80 font-medium">{to}</span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("movement_types.creation_detail")} {to}
          </p>
        )}

        {movement.reason && (
          <p className="mt-1.5 text-xs italic text-muted-foreground/90">
            « {movement.reason} »
          </p>
        )}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/80 font-mono">
          <span>{fmtDate(movement.date, lang)}</span>
          {userLabel && (
            <span>
              {t("movements.by")} {userLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string, lang: Lang): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(lang === "it" ? "it-IT" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
