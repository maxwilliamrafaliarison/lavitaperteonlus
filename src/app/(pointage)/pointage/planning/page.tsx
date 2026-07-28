import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { listPlannings, type Planning } from "@/lib/planning/data";
import { aujourdhui } from "@/lib/tz";

export const dynamic = "force-dynamic";

/**
 * Entrée du module Planning : on arrive DIRECTEMENT sur le tableau.
 *
 * L'écran de liste imposait deux clics avant de voir le moindre créneau,
 * alors que l'usage quotidien est « regarder la semaine en cours ». La liste
 * n'a pas disparu — elle vit sous /pointage/planning/gerer, pour les gestes
 * d'administration (créer, publier, révoquer un lien).
 *
 * Choix du planning ouvert : celui du centre demandé (?centre=…, REX par
 * défaut) qui COUVRE LA DATE DU JOUR ; à défaut, le plus récent du centre.
 * On atterrit sur la semaine courante, pas sur le début du planning — un
 * planning semestriel s'ouvrirait sinon systématiquement sur janvier.
 */
export default async function PlanningEntreePage({
  searchParams,
}: {
  searchParams: Promise<{ centre?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "planning:gerer")) redirect("/pointage");

  const sp = await searchParams;
  const centre = (sp.centre ?? "REX").toUpperCase() === "MIARAKA" ? "MIARAKA" : "REX";

  const res = await safe<Planning[]>(() => listPlannings(), []);
  const duCentre = res.data
    .filter((p) => p.centre === centre)
    .sort((a, b) => b.du.localeCompare(a.du));

  if (duCentre.length === 0) {
    // Rien à afficher pour ce centre : la gestion est le seul écran utile.
    redirect("/pointage/planning/gerer");
  }

  const jour = aujourdhui();
  const courant = duCentre.find((p) => p.du <= jour && jour <= p.au) ?? duCentre[0];

  // Semaine courante (lundi), bornée à la période du planning.
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  let debut = d.toISOString().slice(0, 10);
  if (debut < courant.du) debut = courant.du;
  if (debut > courant.au) debut = courant.au;

  redirect(`/pointage/planning/${courant.id}?vue=semaine&debut=${debut}`);
}
