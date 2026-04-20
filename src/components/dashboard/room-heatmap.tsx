import { GlassCard } from "@/components/glass/glass-card";
import { DoorOpen } from "lucide-react";
import Link from "next/link";
import type { RoomStats } from "@/lib/dashboard-stats";

interface Props {
  rooms: RoomStats[];
  limit?: number;
}

function scoreTone(score: number): {
  bg: string;
  border: string;
  text: string;
} {
  if (score >= 70) {
    return {
      bg: "bg-[oklch(0.75_0.18_150_/_0.08)]",
      border: "border-[oklch(0.75_0.18_150_/_0.25)]",
      text: "text-[oklch(0.75_0.18_150)]",
    };
  }
  if (score >= 40) {
    return {
      bg: "bg-[oklch(0.82_0.16_85_/_0.10)]",
      border: "border-[oklch(0.82_0.16_85_/_0.28)]",
      text: "text-[oklch(0.82_0.16_85)]",
    };
  }
  return {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
  };
}

export function RoomHeatmap({ rooms, limit = 8 }: Props) {
  const displayed = rooms.slice(0, limit);

  if (displayed.length === 0) {
    return (
      <GlassCard className="p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Par salle
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Aucune salle avec matériel.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Zones à risque
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">
            Salles les plus fragiles
          </h3>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {displayed.map((room) => {
          const tone = scoreTone(room.avgScore);
          return (
            <Link
              key={room.roomId}
              href={`/sites/${room.siteId}/rooms/${room.roomId}`}
              className={`flex items-center gap-3 rounded-2xl border ${tone.border} ${tone.bg} px-3 py-2.5 hover:brightness-110 transition-all`}
            >
              <div
                className={`inline-flex size-8 items-center justify-center rounded-lg bg-white/5 ${tone.text} shrink-0`}
              >
                <DoorOpen className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{room.roomName}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {room.siteCode} · {room.roomCode} · {room.total} matériels
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`font-display font-semibold tabular-nums text-lg ${tone.text}`}
                >
                  {room.avgScore}
                </p>
                {room.critical > 0 && (
                  <p className="text-[10px] text-primary tabular-nums">
                    {room.critical} crit.
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {rooms.length > limit && (
        <p className="mt-4 text-xs text-muted-foreground text-center">
          +{rooms.length - limit} autres salles
        </p>
      )}
    </GlassCard>
  );
}
