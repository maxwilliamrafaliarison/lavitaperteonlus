import {
  fusionnerPlages,
  plagesDuJour,
  verifierSeuils,
  SEUILS_DEFAUT,
  type PlageAbsolue,
  type SeuilsLegaux,
} from "./creneau";

/* ============================================================
   REMPLACEMENTS — qui peut prendre ce poste ?
   ============================================================

   Module PUR : aucune entrée-sortie. Il reçoit l'état du monde et rend une
   liste ordonnée, ce qui le rend testable au cas près. C'est nécessaire :
   une proposition fausse envoie quelqu'un travailler onze heures après sa
   garde de nuit.

   ── LA COMPÉTENCE SE LIT DANS L'HISTORIQUE, ELLE NE SE SAISIT PAS ────────
   Un module de remplacement a besoin de savoir qui sait tenir quel poste.
   L'usage serait d'ouvrir une matrice de compétences : cinquante-huit
   personnes multipliées par une douzaine de postes, cochées à la main.
   Personne ne la tiendrait à jour, et six mois plus tard elle mentirait.

   La preuve existe déjà et elle est meilleure : les plannings passés disent
   qui a RÉELLEMENT tenu la sécurité, et combien de fois. « Cynthia a tenu ce
   poste trente-quatre fois depuis trois mois » se vérifie, ne se périme pas,
   et ne demande aucune saisie. Une personne qui ne l'a jamais tenu n'est pas
   écartée pour autant, le centre est trop petit pour cela : elle apparaît
   plus bas, avec la réserve écrite.

   ── LES DEUX CENTRES NE DÉSIGNENT PAS LEURS POSTES PAREIL ────────────────
   REX range son personnel par SERVICE, et ses affectations portent un
   `service_id`. MIARAKA n'a aucun service en base : son organisation tient
   au TYPE de créneau. La compétence se mesure donc sur le service quand il
   existe, et sur le type de créneau sinon. C'est la même asymétrie que
   `postes-critiques.ts` a déjà dû reconnaître.

   ── CE QUE LE MODULE NE FAIT PAS ─────────────────────────────────────────
   Il ne choisit pas. Il ordonne, il explique, et il laisse le responsable
   trancher : un outil qui affecterait tout seul se tromperait un jour sur
   une raison qu'il ne peut pas connaître, et personne ne saurait pourquoi.
   ============================================================ */

/** Le créneau à couvrir, réduit à ce dont le moteur a besoin. */
export interface CreneauModele {
  id: string;
  libelle: string;
  type: string;
  debut: string;
  fin: string;
  debut2: string;
  fin2: string;
  minutes: number;
}

/** Une affectation, réduite à ce dont le moteur a besoin. */
export interface AffectationSimple {
  agent_id: string;
  jour: string;
  creneau_id: string;
  service_id: string;
  debut: string;
  fin: string;
}

/** Un poste à couvrir. */
export interface Besoin {
  jour: string;
  creneauId: string;
  serviceId: string;
  /** Nom du service ou du poste, tel qu'il s'affiche. */
  posteLibelle: string;
  lieu: string;
  centre: string;
  /** Pourquoi ce poste est à couvrir. */
  motif: "poste_vide" | "absence";
  /** Qui manque, quand il s'agit de remplacer quelqu'un. */
  agentRemplaceId: string;
  agentRemplaceNom: string;
  /** Ce qui explique l'absence, pour l'afficher sans aller le chercher. */
  natureAbsence: string;
  /**
   * Horaires DÉROGATOIRES de l'affectation, quand elle en porte.
   *
   * Le remplaçant hérite de l'affectation telle quelle, horaires compris :
   * seul le titulaire change. Simuler le créneau du MODÈLE alors que la
   * ligne porte 18:00-06:00 ferait juger le repos sur les mauvaises heures,
   * et laisserait passer exactement le cas que ce module existe pour
   * empêcher. Vides quand l'affectation suit son modèle.
   */
  debut: string;
  fin: string;
}

export interface AgentCandidat {
  id: string;
  nom: string;
  site: string;
  statut: string;
  poste: string;
  actif: boolean;
}

export interface Candidat {
  agentId: string;
  nom: string;
  poste: string;
  statut: string;
  /** Rien ne l'empêche de prendre ce poste. */
  disponible: boolean;
  /** Ce qui l'empêche : chaque phrase est affichable telle quelle. */
  empechements: string[];
  /** Ce qui mérite un regard sans interdire. */
  reserves: string[];
  /** Combien de fois cette personne a tenu ce poste dans l'historique lu. */
  foisDejaTenu: number;
  /** Minutes déjà planifiées sur la semaine du besoin. */
  minutesSemaine: number;
}

export interface ContexteRemplacement {
  /** Toutes les affectations de la fenêtre de contrôle (±7 jours). */
  affectations: AffectationSimple[];
  /** Affectations plus anciennes, qui servent à mesurer l'expérience. */
  historique: AffectationSimple[];
  creneaux: Map<string, CreneauModele>;
  /** `agentId|jour` → libellé de l'absence acceptée. */
  absences: Map<string, string>;
  seuils?: SeuilsLegaux;
  /** Rattachement d'un agent à un centre (« MIARAKA/REX » existe). */
  rattacheA: (site: string, centre: string) => boolean;
  /**
   * Index « clé de poste → agent → nombre de fois tenu », calculé une fois.
   *
   * Sans lui, chaque poste à couvrir reparcourait les quatre mois
   * d'historique en entier, soit une dizaine de fois le même travail sur un
   * écran qui affiche une dizaine de trous. `indexerExperience` le construit.
   */
  experience?: Map<string, Map<string, number>>;
}

/** Lundi de la semaine ISO contenant `jour`. */
function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Journées d'un agent, prêtes pour le contrôle des seuils.
 *
 * Même règle que le contrôle du planning : on regroupe PAR JOUR avant de
 * juger, parce que deux services tenus le même jour font une seule journée
 * de travail. Les traiter séparément ferait annoncer « zéro minute de repos
 * entre deux services », entre la personne et elle-même.
 */
function journeesDe(
  affectations: AffectationSimple[],
  creneaux: Map<string, CreneauModele>,
): Array<{ jour: string; plages: PlageAbsolue[]; minutes: number }> {
  const parJour = new Map<string, PlageAbsolue[]>();
  for (const a of affectations) {
    const c = creneaux.get(a.creneau_id);
    if (!c) continue;
    // Un horaire dérogatoire décrit TOUTE la journée : il ne se superpose
    // pas à la coupure du modèle, sinon l'après-midi compte deux fois.
    const eff =
      a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, debut2: "", fin2: "", minutes: 0 } : c;
    parJour.set(a.jour, [...(parJour.get(a.jour) ?? []), ...plagesDuJour(a.jour, eff)]);
  }
  return [...parJour.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([jour, plages]) => ({ jour, ...fusionnerPlages(plages) }));
}

/**
 * Clé de compétence d'une affectation.
 *
 * Le service quand il existe, le type de créneau sinon : REX range par
 * service, MIARAKA par type de poste, et le même moteur doit servir les
 * deux sans qu'on invente à MIARAKA des services que personne n'utilise.
 */
function cleCompetence(serviceId: string, creneauType: string): string {
  return serviceId ? `service:${serviceId}` : `type:${creneauType}`;
}

/**
 * Compte, pour chaque poste, combien de fois chaque personne l'a tenu.
 *
 * Un seul parcours des affectations, réutilisable par tous les besoins d'un
 * même écran. Les repos ne comptent pas : tenir un poste, c'est y travailler.
 */
export function indexerExperience(
  affectations: AffectationSimple[],
  creneaux: Map<string, CreneauModele>,
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const a of affectations) {
    const c = creneaux.get(a.creneau_id);
    if (!c || c.type === "repos") continue;
    const cle = cleCompetence(a.service_id, c.type);
    const parAgent = index.get(cle) ?? index.set(cle, new Map()).get(cle)!;
    parAgent.set(a.agent_id, (parAgent.get(a.agent_id) ?? 0) + 1);
  }
  return index;
}

/**
 * Classe les remplaçants possibles pour un poste, du plus évident au moins.
 *
 * ── L'ORDRE EST EXPLICABLE, ET C'EST VOULU ───────────────────────────────
 * Pas de note composite : un chiffre unique fait bien dans une démonstration
 * et ne se défend pas devant la personne qu'on n'a pas choisie. L'ordre suit
 * trois questions, dans cet ordre :
 *
 *   1. Est-elle libre ? Celles qui ne le sont pas ferment la marche, mais
 *      restent visibles avec la raison : il arrive qu'on décide quand même,
 *      et masquer la personne obligerait à la chercher ailleurs.
 *   2. Connaît-elle le poste ? Le nombre de fois où elle l'a tenu.
 *   3. Sa semaine est-elle déjà lourde ? À expérience égale, on va vers
 *      celle qui a le moins d'heures, ce qui répartit la charge au lieu de
 *      toujours rappeler la même.
 */
export function classerCandidats(
  besoin: Besoin,
  agents: AgentCandidat[],
  contexte: ContexteRemplacement,
): Candidat[] {
  const creneau = contexte.creneaux.get(besoin.creneauId);
  const seuils = contexte.seuils ?? SEUILS_DEFAUT;
  const cle = cleCompetence(besoin.serviceId, creneau?.type ?? "");
  const lundi = lundiDe(besoin.jour);
  const dimanche = decaler(lundi, 6);

  /* L'expérience vient de l'index déjà construit quand l'appelant en fournit
     un ; sinon on le calcule ici, pour que la fonction reste utilisable
     seule, notamment par les tests. */
  const experience =
    (contexte.experience ??
      indexerExperience([...contexte.historique, ...contexte.affectations], contexte.creneaux)
    ).get(cle) ?? new Map<string, number>();

  /* Les affectations sont indexées PAR AGENT une seule fois. Les refiltrer
     à chaque candidat coûtait cinquante-huit parcours de la fenêtre entière
     par poste à couvrir, et l'écran en affiche une dizaine : un demi-million
     d'itérations pour une information qu'on peut ranger une fois. */
  const parAgent = new Map<string, AffectationSimple[]>();
  for (const a of contexte.affectations) {
    (parAgent.get(a.agent_id) ?? parAgent.set(a.agent_id, []).get(a.agent_id)!).push(a);
  }

  const candidats: Candidat[] = [];

  for (const agent of agents) {
    if (!agent.actif) continue;
    // La personne qu'on remplace ne peut pas se remplacer elle-même.
    if (agent.id === besoin.agentRemplaceId) continue;
    if (!contexte.rattacheA(agent.site, besoin.centre)) continue;

    const empechements: string[] = [];
    const reserves: string[] = [];

    const siennes = parAgent.get(agent.id) ?? [];

    // 1. Déjà au travail ce jour-là ?
    const dejaCeJour = siennes.filter((a) => a.jour === besoin.jour);
    for (const a of dejaCeJour) {
      const c = contexte.creneaux.get(a.creneau_id);
      if (!c) continue;
      if (c.type === "repos") {
        /* UN REPOS SUR LE MÊME SERVICE EMPÊCHE VRAIMENT, et pas seulement
           par principe : l'unicité de la base porte sur (planning, agent,
           jour, service), si bien que le transfert se heurterait à la ligne
           de repos et échouerait. L'annoncer comme une simple réserve
           promettait une opération que la base refuse, ce qui est la pire
           sorte de message. Le repos se retire d'abord, depuis la grille,
           et ce détour est sain : supprimer une journée de repos mérite un
           geste délibéré. */
        if (a.service_id === besoin.serviceId) {
          empechements.push(
            "Repos prévu ce jour-là : retirez-le depuis la grille avant de confier ce poste",
          );
        } else {
          reserves.push("Repos prévu ce jour-là sur un autre service");
        }
        continue;
      }
      empechements.push(`Déjà affecté ce jour-là (${c.libelle || c.id})`);
    }

    // 2. Absence acceptée ?
    const absence = contexte.absences.get(`${agent.id}|${besoin.jour}`);
    if (absence) empechements.push(`${absence} ce jour-là`);

    // 3. Les seuils légaux tiendraient-ils AVEC ce poste en plus ?
    //    On simule l'affectation plutôt que de raisonner sur la seule
    //    journée : un repos de onze heures se juge sur la veille et le
    //    lendemain, qui peuvent tomber hors de la semaine affichée.
    if (creneau && creneau.type !== "repos") {
      /* ON COMPARE AVANT ET APRÈS, ce qui est la seule façon honnête de
         savoir ce que le remplacement PROVOQUE. La première version se
         contentait de ne garder que les alertes tombant à moins de sept
         jours du besoin : une infraction préexistante dans cette fenêtre,
         née d'une garde saisie la semaine dernière, était donc imputée au
         remplaçant et le déclarait indisponible pour une faute qui n'était
         pas la sienne. Après quoi on cesse de croire l'écran.

         L'horaire DÉROGATOIRE de l'affectation est repris tel quel : le
         remplaçant hérite de la ligne, pas du modèle de créneau. */
      const proposee: AffectationSimple = {
        agent_id: agent.id,
        jour: besoin.jour,
        creneau_id: besoin.creneauId,
        service_id: besoin.serviceId,
        debut: besoin.debut,
        fin: besoin.fin,
      };
      const signature = (a: { jour: string; regle: string; message: string }) =>
        `${a.jour}|${a.regle}|${a.message}`;
      const avant = new Set(
        verifierSeuils(journeesDe(siennes, contexte.creneaux), seuils).map(signature),
      );
      for (const alerte of verifierSeuils(
        journeesDe([...siennes, proposee], contexte.creneaux),
        seuils,
      )) {
        if (avant.has(signature(alerte))) continue;
        if (alerte.bloquant) empechements.push(alerte.message);
        else reserves.push(alerte.message);
      }
    }

    // 4. Charge de la semaine, pour répartir plutôt que rappeler la même.
    const minutesSemaine = journeesDe(
      siennes.filter((a) => a.jour >= lundi && a.jour <= dimanche),
      contexte.creneaux,
    ).reduce((s, j) => s + j.minutes, 0);

    const foisDejaTenu = experience.get(agent.id) ?? 0;
    if (foisDejaTenu === 0) {
      reserves.push(`N'a jamais tenu ce poste sur la période connue`);
    }

    candidats.push({
      agentId: agent.id,
      nom: agent.nom,
      poste: agent.poste,
      statut: agent.statut,
      disponible: empechements.length === 0,
      empechements,
      reserves,
      foisDejaTenu,
      minutesSemaine,
    });
  }

  return candidats.sort(
    (a, b) =>
      Number(b.disponible) - Number(a.disponible) ||
      b.foisDejaTenu - a.foisDejaTenu ||
      a.minutesSemaine - b.minutesSemaine ||
      a.nom.localeCompare(b.nom),
  );
}

/**
 * Phrase qui résume un candidat, dans la langue du terrain.
 *
 * Elle vit ici plutôt que dans le composant parce qu'elle relève de la
 * règle, pas de la mise en page : c'est la justification du rang, et elle
 * doit dire la même chose partout où on la lit.
 */
export function resumerCandidat(c: Candidat): string {
  if (!c.disponible) return c.empechements[0] ?? "Indisponible";
  const heures = `${Math.floor(c.minutesSemaine / 60)}:${String(c.minutesSemaine % 60).padStart(2, "0")}`;
  const experience =
    c.foisDejaTenu > 0
      ? `a tenu ce poste ${c.foisDejaTenu} fois`
      : "n'a jamais tenu ce poste";
  return `Libre, ${experience}, ${heures} planifiées cette semaine`;
}
