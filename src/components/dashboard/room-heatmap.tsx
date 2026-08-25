import Link from "next/link";

import type { RoomStats } from "@/lib/dashboard-stats";
import { getT, type Lang } from "@/lib/i18n";

import { BarreRepere } from "./micrographiques";

/* ============================================================
   ZONES À RISQUE
   ============================================================

   C'est un CLASSEMENT : les salles vont de la plus fragile à la moins
   fragile, et cet ordre est toute l'information. L'ancienne présentation en
   grille de deux colonnes le détruisait : on ne sait pas si le deuxième rang
   se lit à droite du premier ou en dessous, et donnait à chaque salle une
   carte colorée, un fond, une bordure et une pastille d'icône. Huit blocs
   pour huit lignes.

   Une ligne par salle, du plus grave au moins grave, avec la barre à repère
   déjà employée partout ailleurs. Le classement redevient lisible comme un
   classement, et la hauteur du bloc est divisée par trois.

   La couleur ne porte plus l'information seule : le score est écrit, la
   barre le montre, et le rang le dit. Un lecteur qui distingue mal les
   teintes, ou qui imprime la page, garde tout.
   ============================================================ */

interface Props {
  rooms: RoomStats[];
  limit?: number;
  lang?: Lang;
}

export function RoomHeatmap({ rooms, limit = 8, lang = "fr" }: Props) {
  const t = getT(lang);
  const affichees = rooms.slice(0, limit);

  if (affichees.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("dashboard.rooms_section")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.rooms_empty")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold">{t("dashboard.rooms_section")}</h3>
        <p className="text-xs text-muted-foreground">{t("dashboard.rooms_title")}</p>
      </div>

      <ul className="divide-y divide-glass-border border-y border-glass-border">
        {affichees.map((room) => (
          <li key={room.roomId}>
            <Link
              href={`/sites/${room.siteId}/rooms/${room.roomId}`}
              className="group flex items-center gap-4 py-2 transition-colors hover:bg-foreground/[0.03]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm group-hover:text-accent transition-colors">
                  {room.roomName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {room.siteCode} · {room.roomCode} · {room.total}{" "}
                  {t("dashboard.rooms_materials_short")}
                  {room.critical > 0 && (
                    <span className="text-[var(--danger)]">
                      {" · "}
                      {room.critical} {t("dashboard.types_critical_short")}
                    </span>
                  )}
                </span>
              </span>

              {/* Largeur fixe : les barres s'alignent d'une ligne à l'autre,
                  et c'est cet alignement qui rend le classement comparable. */}
              <BarreRepere
                valeur={room.avgScore}
                seuil={70}
                className="hidden w-24 shrink-0 sm:block"
              />
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
                {room.avgScore}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {rooms.length > limit && (
        <p className="text-xs text-muted-foreground">
          {t("dashboard.rooms_others", { n: rooms.length - limit })}
        </p>
      )}
    </section>
  );
}
