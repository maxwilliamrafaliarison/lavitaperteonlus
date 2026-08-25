import type { AgeBucket } from "@/lib/dashboard-stats";
import { getT, type Lang } from "@/lib/i18n";

import { BarreEmpilee, Pastille, type Ton } from "./micrographiques";

/* ============================================================
   ÂGE DU PARC
   ============================================================

   L'ancien graphique alignait treize colonnes, une par année, dont neuf à
   zéro : une demi-largeur de page consacrée à montrer que rien n'a été
   acheté en 2015. Et sa propre légende parlait en TRANCHES d'âge (0-3 ans,
   4-6, 7-9, 10 et plus), c'est-à-dire au grain auquel la question se pose
   réellement. Il affichait donc au mauvais grain, et expliquait le bon en
   dessous.

   Quatre bandes, une seule barre, et la légende en toutes lettres. La forme
   est celle qui sert déjà à la santé du parc : une page qui multiplie les
   types de graphiques oblige l'œil à réapprendre à lire à chaque bloc.

   ── CE QUE LE GRAPHIQUE PAR ANNÉE ENTERRAIT ──────────────────────────────
   Le fait le plus important du parc ne se voyait pas : une seule année
   concentre le gros des achats. Cela veut dire que ces matériels
   vieilliront ENSEMBLE, et qu'il faudra les remplacer ensemble. Un
   responsable qui prépare un budget doit le savoir avant tout le reste ;
   c'est désormais la première chose écrite.
   ============================================================ */

interface Props {
  buckets: AgeBucket[];
  lang?: Lang;
}

interface Tranche {
  cle: string;
  libelle: string;
  ton: Ton;
  compte: number;
}

export function AgeHistogram({ buckets, lang = "fr" }: Props) {
  const t = getT(lang);

  if (buckets.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("dashboard.age_section")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.age_empty")}</p>
      </section>
    );
  }

  const annee = new Date().getFullYear();
  /* L'âge se compte en années révolues : un matériel acheté cette année a
     zéro an, et tombe dans la première tranche. */
  const tranches: Tranche[] = [
    { cle: "0_3", libelle: t("dashboard.age_0_3"), ton: "bon", compte: 0 },
    { cle: "4_6", libelle: t("dashboard.age_4_6"), ton: "neutre", compte: 0 },
    { cle: "7_9", libelle: t("dashboard.age_7_9"), ton: "vigilance", compte: 0 },
    { cle: "10_plus", libelle: t("dashboard.age_10_plus"), ton: "critique", compte: 0 },
  ];
  for (const b of buckets) {
    const age = annee - b.year;
    const i = age <= 3 ? 0 : age <= 6 ? 1 : age <= 9 ? 2 : 3;
    tranches[i].compte += b.count;
  }
  const total = tranches.reduce((s, x) => s + x.compte, 0);
  const pic = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">{t("dashboard.age_section")}</h3>
        {pic.count > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("dashboard.age_peak", { year: pic.year, count: pic.count })}
          </p>
        )}
      </div>

      <BarreEmpilee
        hauteur="h-2.5"
        segments={tranches.map((x) => ({ valeur: x.compte, ton: x.ton, libelle: x.libelle }))}
      />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {tranches
          .filter((x) => x.compte > 0)
          .map((x) => (
            <Pastille key={x.cle} ton={x.ton}>
              {x.libelle}
              <span className="ml-1.5 font-medium tabular-nums text-foreground">{x.compte}</span>
              <span className="ml-1 tabular-nums">
                {total > 0 ? `${Math.round((x.compte / total) * 100)} %` : ""}
              </span>
            </Pastille>
          ))}
      </div>
    </section>
  );
}
