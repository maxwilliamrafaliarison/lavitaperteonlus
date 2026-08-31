"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { sbInsert, sbUpdate, sbDelete, sbSelect } from "@/lib/supabase-server";
import { listCreneaux, verifierSeuilsAgent, PREFIXE_ATTENTE } from "./verif";
import { estPosteAPourvoir, idAffectation } from "@/lib/planning/constantes";
import { nomAffiche, rattacheA } from "@/lib/pointage/data";

/**
 * Un planning PUBLIÉ est visible du personnel en direct : le modifier sans
 * repasser par la validation contournerait le circuit. Les non-validateurs
 * doivent donc le faire repasser en brouillon (via la direction) avant
 * d'éditer ; la direction, elle, édite en connaissance de cause.
 */
/**
 * Le planning visé, pour savoir s'il est déjà diffusé.
 *
 * ── LE BLOCAGE EST DEVENU UNE TRACE ──────────────────────────────────────
 * Modifier un planning publié était REFUSÉ à qui n'était pas validateur,
 * sauf à le renvoyer d'abord en brouillon. L'intention était juste, l'effet
 * ne l'était pas : une correction d'une minute devenait une procédure, ce
 * qui pousse à tenir le vrai planning ailleurs, hors de l'outil. La
 * direction a tranché le 31 août pour la trace plutôt que pour le blocage,
 * ce qui est déjà la règle du reste du module : « l'outil signale, il ne
 * bloque jamais une saisie ».
 *
 * Qui peut modifier reste borné par `planning:gerer`, soit l'administration
 * et la direction, exactement les quatre personnes qui répondent du
 * planning. Chaque modification d'un planning PUBLIÉ leur est notifiée.
 */
async function planningVise(planningId: string) {
  const { rows } = await sbSelect<{ id: string; statut: string; centre: string; libelle: string; token_public: string }>(
    "planning",
    "plannings",
    {
      select: "id,statut,centre,libelle,token_public",
      order: "id.asc",
      limit: 1,
      filters: { id: `eq.${planningId}` },
    },
  );
  return rows[0] ?? null;
}

/** Nom lisible d'un agent, pour la notification. */
async function nomAgent(agentId: string): Promise<string> {
  const { rows } = await sbSelect<{ nom: string; prenom: string }>("pointage", "agents", {
    select: "nom,prenom",
    order: "id.asc",
    limit: 1,
    filters: { id: `eq.${agentId}` },
  });
  const a = rows[0];
  return a ? `${a.prenom} ${a.nom}`.trim() : agentId;
}

/**
 * Prévient les responsables si le planning touché est DÉJÀ PUBLIÉ.
 *
 * N'attend pas l'envoi : la modification est enregistrée, et une messagerie
 * lente ne doit pas retenir la réponse à l'écran. Sur Vercel une promesse
 * abandonnée après la réponse serait tuée avec la fonction, on attend donc
 * bien, mais sans jamais propager d'échec.
 */
async function prevenirSiPublie(
  plan: Awaited<ReturnType<typeof planningVise>>,
  auteur: string,
  nature: string,
  agentId: string,
  jour: string,
  detail: string,
  avant?: string,
) {
  if (!plan || plan.statut !== "publie") return;
  const { consignerModification, envoyerRecapitulatif } = await import("@/lib/planning/notification");
  /* On VIDE d'abord la file si elle a mûri : une séance de corrections
     reprise une heure plus tard ne doit pas se mélanger à la précédente
     dans un même récapitulatif. */
  await envoyerRecapitulatif();
  await consignerModification({
    planningId: plan.id,
    centre: plan.centre,
    libellePlanning: plan.libelle,
    auteur,
    nature,
    agentNom: await nomAgent(agentId),
    jour,
    detail,
    avant,
    lien: plan.token_public
      ? `https://lavitaperteonlus.vercel.app/planning/${plan.token_public}`
      : undefined,
  });
}

export type AffecterResult =
  | { ok: true; supprime?: boolean; alertes: string[] }
  | { ok: false; error: string };

/**
 * Affecte un créneau à un agent pour un jour, ou retire l'affectation quand
 * le créneau choisi est vide.
 *
 * Les seuils légaux sont contrôlés APRÈS écriture et rendus au client comme
 * avertissements : le responsable doit pouvoir enregistrer une organisation
 * exceptionnelle (remplacement d'urgence, garde imprévue) tout en sachant
 * immédiatement qu'elle sort du cadre. Bloquer la saisie le pousserait à
 * tenir son planning ailleurs, hors de tout contrôle.
 */
export async function affecterAction(formData: FormData): Promise<AffecterResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }

  const planningId = String(formData.get("planningId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const creneauId = String(formData.get("creneauId") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const lieu = String(formData.get("lieu") ?? "").trim();
  // Horaires choisis à la souris (créneau « libre ») ou dérogatoires.
  const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const debutLibre = String(formData.get("debut") ?? "").trim();
  const finLibre = String(formData.get("fin") ?? "").trim();
  if ((debutLibre && !HHMM.test(debutLibre)) || (finLibre && !HHMM.test(finLibre))) {
    return { ok: false, error: "Heure invalide : attendu HH:MM." };
  }

  if (!planningId || !agentId || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return { ok: false, error: "Paramètres incomplets." };
  }

  const plan = await planningVise(planningId);
  const auteur = session.user.email ?? "";

  const id = idAffectation(planningId, jour, agentId, serviceId);

  try {
    // Créneau vide = on retire l'affectation plutôt que d'enregistrer un vide,
    // qui se lirait comme « planifié à zéro heure » et non « non planifié ».
    if (!creneauId) {
      await sbDelete("planning", "affectations", { id: `eq.${id}` });
      await prevenirSiPublie(plan, auteur, "Affectation retirée", agentId, jour, "plus de créneau ce jour-là");
      revalidatePath(`/pointage/planning/${planningId}`);
      return { ok: true, supprime: true, alertes: [] };
    }

    const { rows: existant } = await sbSelect<{ id: string }>("planning", "affectations", {
      select: "id",
      order: "id.asc",
      limit: 1,
      filters: { id: `eq.${id}` },
    });

    const ligne = {
      planning_id: planningId,
      agent_id: agentId,
      jour,
      creneau_id: creneauId,
      service_id: serviceId,
      debut: debutLibre,
      fin: finLibre,
      lieu,
      note: "",
    };

    if (existant.length) {
      await sbUpdate("planning", "affectations", { id: `eq.${id}` }, ligne);
    } else {
      await sbInsert("planning", "affectations", [{ id, ...ligne }]);
    }
    await prevenirSiPublie(
      plan,
      auteur,
      existant.length ? "Créneau modifié" : "Créneau ajouté",
      agentId,
      jour,
      debutLibre && finLibre ? `${debutLibre} → ${finLibre}` : `créneau « ${creneauId} »`,
    );

    // Les clients attendent des phrases ; le panneau, lui, lit les alertes
    // entières côté serveur, drapeau `bloquant` compris.
    const alertes = (await verifierSeuilsAgent(agentId, jour)).map((a) => a.message);
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, alertes };
  } catch (e) {
    return { ok: false, error: `Enregistrement impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Déplace une affectation d'un jour à un autre (glisser-déposer), en
 * conservant ou ajustant ses horaires.
 *
 * L'identifiant contient le jour : déplacer change donc l'identité de la
 * ligne. On supprime l'ancienne PUIS on écrit la nouvelle — dans cet ordre,
 * car la destination peut déjà porter une affectation du même agent sur le
 * même service (l'unicité la remplacerait) alors qu'un échec en route doit
 * laisser au pire l'original en place, jamais deux copies.
 */
export async function deplacerAffectationAction(formData: FormData): Promise<AffecterResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const jourAvant = String(formData.get("jourAvant") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const creneauId = String(formData.get("creneauId") ?? "").trim() || "libre";
  const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const debut = String(formData.get("debut") ?? "").trim();
  const fin = String(formData.get("fin") ?? "").trim();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!planningId || !agentId || !DATE.test(jourAvant) || !DATE.test(jour)) {
    return { ok: false, error: "Paramètres incomplets." };
  }
  if ((debut && !HHMM.test(debut)) || (fin && !HHMM.test(fin))) {
    return { ok: false, error: "Heure invalide : attendu HH:MM." };
  }

  const plan = await planningVise(planningId);
  const auteur = session.user.email ?? "";

  const idAvant = idAffectation(planningId, jourAvant, agentId, serviceId);
  const idApres = idAffectation(planningId, jour, agentId, serviceId);
  try {
    if (idAvant !== idApres) await sbDelete("planning", "affectations", { id: `eq.${idAvant}` });
    await sbDelete("planning", "affectations", { id: `eq.${idApres}` });
    await sbInsert("planning", "affectations", [{
      id: idApres, planning_id: planningId, agent_id: agentId, jour,
      creneau_id: creneauId, service_id: serviceId, debut, fin, lieu: "", note: "",
    }]);
    // Les clients attendent des phrases ; le panneau, lui, lit les alertes
    // entières côté serveur, drapeau `bloquant` compris.
    const alertes = (await verifierSeuilsAgent(agentId, jour)).map((a) => a.message);
    await prevenirSiPublie(
      plan, auteur,
      jourAvant === jour ? "Horaire modifié" : "Créneau déplacé",
      agentId, jour, `${debut} → ${fin}`,
      jourAvant === jour ? undefined : `était le ${jourAvant}`,
    );
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, alertes };
  } catch (e) {
    return { ok: false, error: `Déplacement impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Recopie une semaine d'affectations sur une autre (geste le plus courant
 * des logiciels d'emploi du temps : la semaine type se propage).
 *
 * Les jours déjà planifiés à destination sont PRÉSERVÉS : recopier ne doit
 * jamais écraser un ajustement fait à la main — le responsable recopie
 * d'abord, ajuste ensuite.
 */
export async function dupliquerSemaineAction(formData: FormData): Promise<
  { ok: true; copiees: number; ignorees: number } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const cible = String(formData.get("cible") ?? "").trim();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!planningId || !DATE.test(source) || !DATE.test(cible) || source === cible) {
    return { ok: false, error: "Paramètres incomplets." };
  }

  const planDup = await planningVise(planningId);
  const auteurDup = session.user.email ?? "";

  const decale = (j: string, n: number) => {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const finSource = decale(source, 6);
  try {
    const { rows: existantes } = await sbSelect<{ id: string; agent_id: string; jour: string; creneau_id: string; service_id: string; debut: string; fin: string; lieu: string }>(
      "planning", "affectations",
      { select: "*", order: "id.asc", limit: 1000, filters: { planning_id: `eq.${planningId}`, and: `(jour.gte.${source},jour.lte.${finSource})` } },
    );
    const finCible = decale(cible, 6);
    const { rows: dejaLa } = await sbSelect<{ id: string }>(
      "planning", "affectations",
      { select: "id", order: "id.asc", limit: 1000, filters: { planning_id: `eq.${planningId}`, and: `(jour.gte.${cible},jour.lte.${finCible})` } },
    );
    const occupees = new Set(dejaLa.map((x) => x.id));

    const copies: Record<string, unknown>[] = [];
    let ignorees = 0;
    for (const a of existantes) {
      const ecart = Math.round((Date.parse(`${a.jour}T12:00:00Z`) - Date.parse(`${source}T12:00:00Z`)) / 86400000);
      const jour = decale(cible, ecart);
      const id = `AFF-${planningId}-${jour.replace(/-/g, "")}-${a.agent_id}-${a.service_id || "x"}`;
      if (occupees.has(id)) { ignorees++; continue; }
      occupees.add(id);
      copies.push({ id, planning_id: planningId, agent_id: a.agent_id, jour, creneau_id: a.creneau_id, service_id: a.service_id, debut: a.debut, fin: a.fin, lieu: a.lieu, note: "" });
    }
    for (let i = 0; i < copies.length; i += 500) await sbInsert("planning", "affectations", copies.slice(i, i + 500));
    /* Une recopie touche des dizaines de lignes : on annonce le GESTE, non
       chacune de ses lignes. Un courriel par affectation copiée noierait
       l'information qu'il est censé porter. */
    if (copies.length > 0 && planDup?.statut === "publie") {
      const { consignerModification } = await import("@/lib/planning/notification");
      await consignerModification({
        planningId, centre: planDup.centre, libellePlanning: planDup.libelle,
        auteur: auteurDup, nature: "Semaine recopiée",
        agentNom: `${copies.length} affectation(s)`,
        jour: cible,
        detail: `semaine du ${source} recopiée sur celle du ${cible}${ignorees ? `, ${ignorees} jour(s) déjà planifié(s) préservé(s)` : ""}`,
        lien: planDup.token_public
          ? `https://lavitaperteonlus.vercel.app/planning/${planDup.token_public}`
          : undefined,
      });
    }
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, copiees: copies.length, ignorees };
  } catch (e) {
    return { ok: false, error: `Duplication impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Propage la semaine affichée sur PLUSIEURS semaines à la fois.
 *
 * C'est le geste qui remplace la recopie manuelle : la DRH tient un
 * roulement — une semaine type qui se répète — et le reportait jusqu'ici
 * semaine après semaine, à la main, dans un onglet Excel. Ici on allume les
 * semaines voulues dans la barre du bas et on applique en une fois.
 *
 * Les jours DÉJÀ planifiés sont préservés, jamais écrasés : propager sur un
 * trimestre ne doit pas effacer les ajustements qu'on y a faits. Chaque
 * semaine est traitée séparément et rend son compte, pour qu'on sache
 * exactement où la propagation a mordu et où elle s'est effacée.
 */
export async function propagerSemaineAction(formData: FormData): Promise<
  | { ok: true; resultats: Array<{ semaine: string; copiees: number; ignorees: number }> }
  | { ok: false; error: string }
> {
  const cibles = String(formData.get("cibles") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
  if (!cibles.length) return { ok: false, error: "Aucune semaine sélectionnée." };
  if (cibles.length > 26) {
    // Un semestre d'un coup est déjà beaucoup ; au-delà, c'est une fausse
    // manœuvre plus probablement qu'une intention.
    return { ok: false, error: "Trop de semaines d'un coup : 26 au maximum." };
  }

  const resultats: Array<{ semaine: string; copiees: number; ignorees: number }> = [];
  for (const cible of cibles) {
    const fd = new FormData();
    fd.set("planningId", String(formData.get("planningId") ?? ""));
    fd.set("source", String(formData.get("source") ?? ""));
    fd.set("cible", cible);
    const r = await dupliquerSemaineAction(fd);
    if (!r.ok) return { ok: false, error: `Semaine du ${cible} : ${r.error}` };
    resultats.push({ semaine: cible, copiees: r.copiees, ignorees: r.ignorees });
  }
  return { ok: true, resultats };
}

/* ============================================================
   POSTES À POURVOIR
   ============================================================
   Un poste qu'on sait devoir exister sans savoir encore qui le tiendra.
   C'est la ligne griffonnée en bas de la feuille Excel — « il faut
   quelqu'un samedi soir » — à laquelle on donne enfin un lieu dans
   l'application, au lieu de la garder en tête ou sur un papier.

   Techniquement, une affectation SANS AGENT : le jour, le service et le
   créneau sont posés, seule la personne manque. L'attribuer ne crée donc
   rien, elle remplit un trou déjà décrit — et le poste garde son horaire,
   son service et son lieu au passage.

   L'identifiant d'agent porte le préfixe `__attente-` : il ne peut se
   confondre avec aucune fiche, il satisfait la contrainte d'unicité (deux
   postes à pourvoir le même jour dans le même service restent distincts),
   et tout ce qui parcourt le référentiel l'ignore naturellement.
   ============================================================ */

export async function ajouterPosteAttenteAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const creneauId = String(formData.get("creneauId") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const note = String(formData.get("note") ?? "").slice(0, 200);
  if (!planningId || !/^\d{4}-\d{2}-\d{2}$/.test(jour) || !creneauId) {
    return { ok: false, error: "Jour et créneau sont nécessaires." };
  }
  /* Un poste à pourvoir ne nomme personne : il n'y a rien à annoncer au
     personnel tant qu'il n'est pas attribué. La notification part à
     l'attribution, pas à la note. */

  /* Le suffixe distingue deux postes à pourvoir le même jour dans le même
     service — un centre de garde peut en manquer deux. Il vient du compte
     des postes déjà en attente ce jour-là, pas d'un hasard : relancer la
     même demande deux fois ne doit pas créer deux lignes. */
  const { rows: deja } = await sbSelect<{ agent_id: string }>("planning", "affectations", {
    select: "agent_id",
    order: "id.asc",
    limit: 100,
    filters: { planning_id: `eq.${planningId}`, jour: `eq.${jour}` },
  });
  const n = deja.filter((r) => r.agent_id.startsWith(PREFIXE_ATTENTE)).length + 1;
  const agentId = `${PREFIXE_ATTENTE}${n}`;

  try {
    await sbInsert("planning", "affectations", [
      {
        id: `AFF-ATT-${planningId}-${jour.replace(/-/g, "")}-${n}`,
        planning_id: planningId,
        agent_id: agentId,
        jour,
        creneau_id: creneauId,
        service_id: serviceId,
        debut: "",
        fin: "",
        lieu: "",
        note,
      },
    ]);
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Ajout impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Attribue un poste à pourvoir, ou le retire.
 *
 * L'attribution est une simple bascule d'agent : le jour, le créneau et le
 * service sont déjà décrits, et c'est précisément ce qui fait la valeur de
 * la file d'attente — la décision prise il y a trois jours n'est pas à
 * reprendre au moment d'y mettre un nom.
 */
export async function attribuerPosteAction(formData: FormData): Promise<
  { ok: true; alertes: string[] } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const affectationId = String(formData.get("affectationId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  if (!planningId || !affectationId) return { ok: false, error: "Paramètres incomplets." };
  const planAttr = await planningVise(planningId);
  const auteurAttr = session.user.email ?? "";

  try {
    if (!agentId) {
      await sbDelete("planning", "affectations", { id: `eq.${affectationId}` });
      revalidatePath(`/pointage/planning/${planningId}`);
      return { ok: true, alertes: [] };
    }
    const { rows } = await sbSelect<{ jour: string }>("planning", "affectations", {
      select: "jour",
      order: "id.asc",
      limit: 1,
      filters: { id: `eq.${affectationId}` },
    });
    await sbUpdate("planning", "affectations", { agent_id: agentId }, { id: `eq.${affectationId}` });
    const alertes = rows[0]
      ? (await verifierSeuilsAgent(agentId, rows[0].jour)).map((a) => a.message)
      : [];
    if (rows[0]) {
      await prevenirSiPublie(
        planAttr, auteurAttr, "Poste à pourvoir attribué",
        agentId, rows[0].jour, "prend ce poste, qui était en attente",
      );
    }
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, alertes };
  } catch (e) {
    return { ok: false, error: `Attribution impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Confie un poste à quelqu'un d'autre : remplacement ou poste vide.
 *
 * ── POURQUOI CETTE ACTION EXISTE À CÔTÉ DE `attribuerPosteAction` ────────
 * Les deux réécrivent le même champ, mais elles ne racontent pas la même
 * histoire au journal. Combler un poste ouvert se dit « prend ce poste, qui
 * était en attente ». Remplacer quelqu'un dit QUI est remplacé et pourquoi,
 * et c'est cette phrase-là qui part aux quatre responsables : sans le nom de
 * la personne absente, l'avis est illisible et personne ne peut vérifier que
 * le remplacement était le bon.
 *
 * ── L'IDENTIFIANT SE RÉÉCRIT AVEC LE TITULAIRE ───────────────────────────
 * L'id d'une affectation encode l'agent (voir `idAffectation`). Ne changer
 * que `agent_id` laissait une ligne dont l'id nommait la personne remplacée :
 * la grille ne la retrouvait plus, la rouvrir échouait sur l'index
 * d'unicité, et un glisser-déposer créait un doublon qui faisait compter ses
 * heures deux fois dans le contrôle légal. Les deux champs changent donc
 * ensemble, dans la même écriture.
 *
 * L'affectation est TRANSFÉRÉE, elle n'est pas dupliquée : le poste reste
 * tenu par une seule personne. Ce que la personne absente devait faire reste
 * lisible dans son absence, qui porte ses dates et son motif.
 */
export async function remplacerAction(formData: FormData): Promise<
  { ok: true; alertes: string[]; message: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }

  const affectationId = String(formData.get("affectationId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  if (!affectationId || !agentId) return { ok: false, error: "Paramètres incomplets." };

  let ligne: { id: string; planning_id: string; agent_id: string; jour: string; service_id: string };
  let nouvelId = "";
  try {
    const { rows } = await sbSelect<typeof ligne>("planning", "affectations", {
      select: "id,planning_id,agent_id,jour,service_id",
      order: "id.asc",
      limit: 1,
      filters: { id: `eq.${affectationId}` },
    });
    if (!rows[0]) return { ok: false, error: "Ce poste n'existe plus. Rechargez la page." };
    ligne = rows[0];
    if (ligne.agent_id === agentId) {
      return { ok: false, error: "Cette personne tient déjà ce poste." };
    }

    /* LE REMPLAÇANT EST VÉRIFIÉ CÔTÉ SERVEUR. La liste affichée l'a déjà
       filtré, mais une liste n'est pas un contrôle : elle a pu être calculée
       il y a une heure, et rien n'oblige un appel à passer par elle. */
    const { rows: candidats } = await sbSelect<{ id: string; nom: string; prenom: string; site: string; actif: boolean }>(
      "pointage",
      "agents",
      { select: "id,nom,prenom,site,actif", order: "id.asc", limit: 1, filters: { id: `eq.${agentId}` } },
    );
    const remplacant = candidats[0];
    if (!remplacant) return { ok: false, error: "Cette personne n'existe pas." };
    if (!remplacant.actif) {
      return { ok: false, error: "Cette personne ne fait plus partie du personnel actif." };
    }
    const plan = await planningVise(ligne.planning_id);
    if (plan && !rattacheA(remplacant.site, plan.centre)) {
      return {
        ok: false,
        error: `${nomAffiche(remplacant)} n'est pas rattachée à ${plan.centre}.`,
      };
    }

    nouvelId = idAffectation(ligne.planning_id, ligne.jour, agentId, ligne.service_id);

    /* L'écriture est CONDITIONNÉE au titulaire qu'on croyait trouver : deux
       personnes traitant le même trou en même temps, ou un onglet resté
       ouvert depuis ce matin, écraseraient sinon le remplacement de l'autre
       sans que rien ne le signale. */
    const n = await sbUpdate(
      "planning",
      "affectations",
      { id: `eq.${affectationId}`, agent_id: `eq.${ligne.agent_id}` },
      { id: nouvelId, agent_id: agentId },
    );
    if (n === 0) {
      return {
        ok: false,
        error: "Ce poste vient d'être confié à quelqu'un d'autre. Rechargez la page.",
      };
    }
  } catch (e) {
    const msg = String(e);
    /* L'index d'unicité porte sur (planning, agent, jour, service) : le
       heurter signifie que cette personne a DÉJÀ quelque chose ce jour-là
       sur ce service, un repos le plus souvent. On le dit en clair plutôt
       que de rendre un code Postgres. */
    if (msg.includes("23505") || msg.includes("duplicate") || msg.includes("409")) {
      return {
        ok: false,
        error:
          "Cette personne a déjà un créneau ce jour-là sur ce service, un repos peut-être. Retirez-le depuis la grille, puis recommencez.",
      };
    }
    return { ok: false, error: `Remplacement impossible : ${msg.slice(0, 150)}` };
  }

  /* ── CE QUI SUIT NE PEUT PLUS FAIRE ÉCHOUER L'ACTION ────────────────────
     Le transfert est écrit. Les lectures qui suivent servent à composer le
     message et à prévenir les responsables ; si l'une d'elles tombe, il
     serait faux d'annoncer « remplacement impossible » alors qu'il a eu
     lieu. On rend donc le succès, avec ce qu'on a pu obtenir. */
  let message = "Poste confié.";
  let alertes: string[] = [];
  try {
    const remplacant = await nomAgent(agentId);
    const remplace = estPosteAPourvoir(ligne.agent_id) ? "" : await nomAgent(ligne.agent_id);
    const plan = await planningVise(ligne.planning_id);
    await prevenirSiPublie(
      plan,
      session.user.email ?? "",
      remplace ? "Remplacement" : "Poste à pourvoir attribué",
      agentId,
      ligne.jour,
      remplace
        ? `remplace ${remplace}${motif ? ` (${motif})` : ""}`
        : "prend ce poste, qui était en attente",
      remplace,
    );
    alertes = (await verifierSeuilsAgent(agentId, ligne.jour)).map((a) => a.message);
    message = remplace
      ? `${remplacant} remplace ${remplace} le ${ligne.jour}.`
      : `${remplacant} prend ce poste le ${ligne.jour}.`;
  } catch {
    message = `Poste confié le ${ligne.jour}. L'avis aux responsables n'a pas pu être préparé.`;
  }

  revalidatePath(`/pointage/planning/${ligne.planning_id}`);
  revalidatePath("/pointage/planning/remplacements");
  return { ok: true, alertes, message };
}

export { listCreneaux };

/**
 * Demande l'envoi du récapitulatif des modifications en attente.
 *
 * Appelée par le navigateur après un silence qu'il a lui-même mesuré : lui
 * seul sait qu'on a cessé de modifier. Elle force donc l'envoi sans
 * attendre le délai, que les autres chemins d'appel respectent faute de
 * cette information.
 *
 * Sans effet visible : l'appelant n'a rien à faire du résultat, et une
 * messagerie en panne ne doit rien casser à l'écran.
 */
export async function envoyerRecapModificationsAction(): Promise<{ envoye: boolean }> {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "planning:gerer")) return { envoye: false };
  const { envoyerRecapitulatif } = await import("@/lib/planning/notification");
  const r = await envoyerRecapitulatif(true);
  return { envoye: r.envoye };
}
