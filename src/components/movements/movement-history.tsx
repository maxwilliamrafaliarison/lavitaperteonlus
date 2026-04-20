import { GlassCard } from "@/components/glass/glass-card";
import { History } from "lucide-react";
import { MovementCard } from "./movement-card";
import type { Movement, Site, Room, AppUser } from "@/types";

interface Props {
  movements: Movement[];
  sites: Site[];
  rooms: Room[];
  users: AppUser[];
}

export function MovementHistory({ movements, sites, rooms, users }: Props) {
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <History className="size-4" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Historique</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transferts, réparations et évolutions de ce matériel
            </p>
          </div>
        </div>
        {movements.length > 0 && (
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {movements.length} événement{movements.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="mt-6">
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucun mouvement enregistré pour ce matériel.
          </p>
        ) : (
          <div className="rounded-2xl border border-glass-border overflow-hidden divide-y divide-glass-border">
            {movements.map((m) => (
              <MovementCard
                key={m.id}
                movement={m}
                siteMap={siteMap}
                roomMap={roomMap}
                userLabel={userMap.get(m.byUserId)?.name ?? "—"}
              />
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
