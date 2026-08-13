/* ============================================================
   PLANNING — les postes qu'on ne peut pas laisser vides
   ============================================================

   Un seul refus dans tout le module, et il porte sur la PUBLICATION, jamais
   sur la saisie. Publier, c'est dire au personnel « voilà la semaine » :
   une semaine où la garde de nuit n'a personne ne doit pas pouvoir être
   annoncée sans que quelqu'un l'ait vu et assumé.

   La règle a été donnée par la direction le 13 août 2026 :
     MIARAKA — la garde de nuit ;
     REX     — la sécurité et l'accueil.

   ── DEUX MANIÈRES DE DÉSIGNER UN POSTE ───────────────────────────────────
   REX range son personnel par SERVICE : « Sécurité », « Accueil-Caisse »
   sont des lignes de la table `services`, et l'exigence s'écrit
   `service:securite`.

   MIARAKA n'a AUCUN service en base : ses affectations n'en portent pas, et
   son organisation tient au type de poste. L'exigence s'y écrit donc
   `type:garde_nuit` — au moins une personne sur un créneau de garde, quel
   qu'il soit. Plaquer le modèle de REX sur MIARAKA aurait obligé à inventer
   des services que personne n'utilise.

   ── CE QUE LA RÈGLE NE FAIT PAS ──────────────────────────────────────────
   Elle ne compte pas les effectifs : un poste tenu par une personne est
   tenu. Le centre n'a jamais écrit d'effectif cible, et en inventer un
   ferait refuser des semaines parfaitement normales — après quoi on
   apprendrait à passer outre, et le refus ne vaudrait plus rien.

   Elle ne juge pas non plus les jours hors période, ni les repos : un
   agent en congé ne tient pas un poste.
   ============================================================ */

export interface ExigencePoste {
  /** "service" : un service donné ; "type" : une famille de créneau. */
  genre: "service" | "type";
  valeur: string;
  /** Ce qu'on écrit à l'écran quand le poste est vide. */
  libelle: string;
}

/** Réglage par défaut, tel que la direction l'a énoncé. */
export const EXIGENCES_DEFAUT: Record<string, string> = {
  REX: "service:securite,service:caisse",
  MIARAKA: "type:garde_nuit",
};

/**
 * Lit une exigence écrite « service:securite,type:garde_nuit ».
 *
 * Le format tient en une chaîne parce qu'il vit dans `planning.parametres`,
 * une table clé/valeur : la direction peut changer la règle sans qu'on
 * redéploie, et sans qu'on ait à faire passer une migration.
 */
export function lireExigences(
  brut: string | undefined,
  libelles: Map<string, string>,
): ExigencePoste[] {
  return (brut ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [genre, valeur] = x.split(":");
      if (genre !== "service" && genre !== "type") return null;
      if (!valeur) return null;
      return {
        genre,
        valeur,
        libelle: libelles.get(valeur) ?? (genre === "type" ? "Garde de nuit" : valeur),
      };
    })
    .filter((x): x is ExigencePoste => x !== null);
}

export interface AffectationMinimale {
  jour: string;
  serviceId: string;
  creneauType: string;
  /** true si le créneau est un repos, un congé ou un férié. */
  repos: boolean;
  /** true si le poste n'a pas encore de titulaire. */
  sansTitulaire: boolean;
}

export interface TrouCritique {
  jour: string;
  libelle: string;
}

/**
 * Les jours où un poste critique n'est tenu par personne.
 *
 * Un poste NOTÉ À POURVOIR ne compte pas comme tenu : c'est précisément le
 * cas qu'il faut voir avant de publier — la DRH sait qu'il manque quelqu'un,
 * et la publication le dirait au personnel sans le dire à la direction.
 */
export function trousCritiques(
  jours: string[],
  affectations: AffectationMinimale[],
  exigences: ExigencePoste[],
): TrouCritique[] {
  const trous: TrouCritique[] = [];
  for (const jour of jours) {
    const duJour = affectations.filter((a) => a.jour === jour && !a.repos && !a.sansTitulaire);
    for (const e of exigences) {
      const tenu = duJour.some((a) =>
        e.genre === "service" ? a.serviceId === e.valeur : a.creneauType === e.valeur,
      );
      if (!tenu) trous.push({ jour, libelle: e.libelle });
    }
  }
  return trous;
}

/** Phrase unique, lisible par quelqu'un qui n'a pas la grille sous les yeux. */
export function resumerTrous(trous: TrouCritique[]): string {
  const parLibelle = new Map<string, string[]>();
  for (const t of trous) parLibelle.set(t.libelle, [...(parLibelle.get(t.libelle) ?? []), t.jour]);
  return [...parLibelle.entries()]
    .map(([libelle, jours]) => {
      const dates = jours
        .sort()
        .map((j) =>
          new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }),
        )
        .join(", ");
      return `${libelle} : ${dates}`;
    })
    .join(" · ");
}
