"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { estNature, libelleNature, REGLES } from "@/lib/pointage/absences";
import {
  absencesAgent,
  absencesEnAttente,
  conflits,
  insererAbsence,
  insererFerie,
  joursADecompter,
  listFeries,
  listParametresPointage,
  majAbsence,
  reglagesDe,
  type Absence,
} from "@/lib/pointage/absences-data";
import { listAgents, listHoraires, nomAffiche, rattacheA, versHoraireTheorique } from "@/lib/pointage/data";
import { randomBytes } from "node:crypto";
import { sbDelete, sbInsert, sbUpdate } from "@/lib/supabase-server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ============================================================
   CONGÉS ET ABSENCES — actions
   ============================================================

   ── DÉCLARER N'EST PAS ACCORDER ──────────────────────────────────────────
   Consigner qu'une personne sera absente est un geste de registre, quotidien,
   qui revient à l'administration et à la RH. Accorder un congé engage l'ONG :
   elle se prive d'une personne et le jour sort d'un solde. C'est une décision
   d'employeur.

   La distinction ne doit pourtant pas coûter un aller-retour à celle qui a
   les deux droits. Quand la personne qui déclare peut aussi accorder, la
   demande naît ACCEPTÉE : lui faire valider sa propre demande serait un
   rituel vide, et le genre de détour qui décourage l'usage d'un outil.
   ============================================================ */

/**
 * Identifiant lisible ET unique.
 *
 * La première version valait `ABS-agent-premierJour`, ce qui est une clé
 * primaire trop étroite : le contrôle anti-doublon ignore délibérément les
 * absences refusées ou annulées, si bien qu'une nouvelle absence commençant
 * le même jour qu'une absence annulée passait le contrôle puis heurtait la
 * clé primaire. La personne lisait « une absence existe déjà » devant un
 * tableau qui affiche « Annulée » : contradiction insoluble depuis l'écran.
 *
 * Le suffixe aléatoire lève l'ambiguïté sans rendre l'identifiant opaque :
 * on continue de lire qui et quand au premier coup d'œil.
 */
function idAbsence(agentId: string, du: string): string {
  const suffixe = randomBytes(3).toString("hex");
  return `ABS-${agentId}-${du.replace(/-/g, "")}-${suffixe}`;
}

/**
 * Jours fériés applicables à une personne.
 *
 * Un férié peut être propre à un centre : MIARAKA peut chômer un jour où
 * REX travaille. Passer la liste entière au décompte offrirait aux agents
 * de REX un jour de congé gratuit à chaque fête de MIARAKA traversée, et
 * l'écart se figerait dans `jours_decomptes`, donc survivrait même à la
 * correction du code.
 *
 * `rattacheA` plutôt qu'une égalité : la DRH écrit « MIARAKA/REX » pour les
 * dix personnes qui tiennent un poste dans les deux centres, et une
 * comparaison stricte les priverait des fériés des deux.
 */
function feriesApplicables(feries: Array<{ jour: string; centre: string }>, site: string): string[] {
  return feries.filter((f) => !f.centre || rattacheA(site, f.centre)).map((f) => f.jour);
}

export async function declarerAbsenceAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences")) {
    return { ok: false, error: "Votre rôle ne permet pas de déclarer une absence." };
  }

  const agentId = String(formData.get("agentId") ?? "").trim();
  const nature = String(formData.get("nature") ?? "").trim();
  const du = String(formData.get("du") ?? "").trim();
  const au = String(formData.get("au") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();

  if (!agentId) return { ok: false, error: "Choisissez une personne." };
  if (!estNature(nature)) return { ok: false, error: "Nature d'absence inconnue." };
  if (!DATE.test(du) || !DATE.test(au)) {
    return { ok: false, error: "Indiquez un premier et un dernier jour." };
  }
  if (au < du) {
    return { ok: false, error: "Le dernier jour précède le premier." };
  }
  /* Une absence de plus d'un an relève de la faute de frappe (2026 tapé
     2062) bien plus sûrement que d'un cas réel. La refuser évite d'écrire
     une ligne qui neutraliserait le pointage de la personne pour toujours. */
  const jours = Math.round((Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`)) / 86400000) + 1;
  if (jours > 366) {
    return { ok: false, error: "Période supérieure à un an : vérifiez les dates." };
  }

  try {
    const [existantes, agents, horaires, parametres, feries] = await Promise.all([
      absencesAgent(agentId),
      listAgents(),
      listHoraires(),
      listParametresPointage(),
      listFeries(),
    ]);

    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return { ok: false, error: "Personne inconnue." };

    /* Deux absences sur les mêmes jours décompteraient deux fois le même
       congé. On dit CE QUI bloque, et non « conflit » : la personne doit
       pouvoir corriger sans aller chercher ailleurs. */
    const collision = conflits(existantes, { du, au });
    if (collision.length > 0) {
      const c = collision[0];
      return {
        ok: false,
        error: `${nomAffiche(agent)} a déjà une absence du ${c.du} au ${c.au} (${libelleNature(c.nature)}). Annulez-la d'abord si elle n'est plus d'actualité, puis déclarez la nouvelle.`,
      };
    }

    const horaire = horaires.find((h) => h.id === agent.horaire_id) ?? horaires.find((h) => h.id === "std");
    const joursTravailles = horaire
      ? versHoraireTheorique(horaire).joursTravailles
      : [1, 2, 3, 4, 5, 6];
    const reglages = reglagesDe(parametres);
    const decomptes = joursADecompter(
      nature,
      du,
      au,
      reglages,
      joursTravailles,
      feriesApplicables(feries, agent.site),
    );

    // Celle qui peut accorder n'a pas à se valider elle-même.
    const accordeDirectement = can(session.user.role, "pointage:absences-valider");
    const maintenant = new Date().toISOString();
    const email = session.user.email ?? "";

    await insererAbsence({
      id: idAbsence(agentId, du),
      agent_id: agentId,
      nature,
      du,
      au,
      demi_debut: "",
      demi_fin: "",
      etat: accordeDirectement ? "acceptee" : "demande",
      motif,
      jours_decomptes: decomptes,
      demande_par: email,
      demande_le: maintenant,
      decide_par: accordeDirectement ? email : "",
      decide_le: accordeDirectement ? maintenant : "",
      decision_note: "",
    });

    revalidatePath("/pointage/absences");
    revalidatePath("/pointage/ecarts");
    revalidatePath("/pointage");

    const nom = nomAffiche(agent);
    const compte =
      REGLES[nature].decompteSolde && decomptes > 0
        ? ` ${decomptes} jour${decomptes > 1 ? "s" : ""} décompté${decomptes > 1 ? "s" : ""} du solde.`
        : "";
    return {
      ok: true,
      message: accordeDirectement
        ? `${libelleNature(nature)} accordé à ${nom} du ${du} au ${au}.${compte}`
        : `Demande enregistrée pour ${nom}. La direction doit encore l'accorder.`,
    };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("409") || msg.includes("duplicate")) {
      return { ok: false, error: "Une absence commençant ce jour-là existe déjà pour cette personne." };
    }
    if (msg.includes("42P01")) {
      return { ok: false, error: "La table des absences n'existe pas encore : appliquez la migration 023." };
    }
    return { ok: false, error: `Enregistrement impossible : ${msg.slice(0, 160)}` };
  }
}

/**
 * Accorde ou refuse une demande.
 *
 * Le refus garde la ligne : savoir qu'une demande a été faite et refusée,
 * par qui et quand, vaut mieux que de la voir disparaître sans trace.
 */
export async function deciderAbsenceAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences-valider")) {
    return { ok: false, error: "Seule la direction peut accorder ou refuser une absence." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { ok: false, error: "Absence introuvable." };
  if (!["acceptee", "refusee"].includes(decision)) {
    return { ok: false, error: "Décision inconnue." };
  }

  try {
    /* LE DÉCOMPTE SE FIGE ICI, pas à la déclaration. Entre les deux, un jour
       férié a pu être ajouté au calendrier, et c'est le chiffre du jour de la
       décision qui engage. La migration l'annonçait déjà ; le code, lui, se
       contentait de recopier la valeur de la déclaration. */
    const patch: Record<string, unknown> = {
      etat: decision,
      decide_par: session.user.email ?? "",
      decide_le: new Date().toISOString(),
      decision_note: note,
    };

    if (decision === "acceptee") {
      const [toutes, agents, horaires, parametres, feries] = await Promise.all([
        absencesEnAttente(),
        listAgents(),
        listHoraires(),
        listParametresPointage(),
        listFeries(),
      ]);
      const abs = toutes.find((a) => a.id === id);
      const agent = abs ? agents.find((a) => a.id === abs.agent_id) : undefined;
      if (abs && agent) {
        const horaire =
          horaires.find((h) => h.id === agent.horaire_id) ?? horaires.find((h) => h.id === "std");
        patch.jours_decomptes = joursADecompter(
          abs.nature,
          abs.du,
          abs.au,
          reglagesDe(parametres),
          horaire ? versHoraireTheorique(horaire).joursTravailles : [1, 2, 3, 4, 5, 6],
          feriesApplicables(feries, agent.site),
        );
      }
    }

    /* Le filtre porte AUSSI sur l'état de départ : sans lui, un double clic
       ou un onglet resté ouvert depuis la veille permettait de « décider »
       une absence déjà accordée, refusée ou annulée, et d'en réécrire
       silencieusement l'auteur et la date. */
    const n = await majAbsence(id, patch, "demande");
    if (n === 0) {
      return {
        ok: false,
        error: "Cette demande a déjà été tranchée, ou elle n'existe plus. Rechargez la page.",
      };
    }
    revalidatePath("/pointage/absences");
    revalidatePath("/pointage/ecarts");
    revalidatePath("/pointage");
    return {
      ok: true,
      message: decision === "acceptee" ? "Absence accordée." : "Demande refusée.",
    };
  } catch (e) {
    return { ok: false, error: `Décision impossible : ${String(e).slice(0, 160)}` };
  }
}

/**
 * Annule une absence.
 *
 * On n'efface pas : l'état passe à « annulée ». Une absence accordée puis
 * retirée est un fait de gestion, et la personne concernée a pu s'organiser
 * en conséquence. La trace est ce qui permet d'en répondre.
 *
 * ── DEUX GESTES SOUS UN MÊME MOT ─────────────────────────────────────────
 * Retirer une demande qu'on vient de poser est un geste de registre : celle
 * qui l'a saisie doit pouvoir se corriger. Défaire un congé ACCORDÉ en est
 * un autre : la décision engageait l'ONG, les jours sont sortis du solde et
 * la personne s'est organisée. Le second exige donc le droit qui a permis
 * d'accorder, sans quoi la RH déferait d'un clic ce que la direction a
 * décidé, et la séparation des rôles ne vaudrait plus rien.
 */
export async function annulerAbsenceAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences")) {
    return { ok: false, error: "Votre rôle ne permet pas d'annuler une absence." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const etatActuel = String(formData.get("etat") ?? "").trim();
  if (!id) return { ok: false, error: "Absence introuvable." };

  if (etatActuel === "acceptee" && !can(session.user.role, "pointage:absences-valider")) {
    return {
      ok: false,
      error:
        "Cette absence a été accordée par la direction : seule la direction peut la retirer. Signalez-lui le changement.",
    };
  }

  try {
    const n = await majAbsence(id, {
      etat: "annulee",
      decide_par: session.user.email ?? "",
      decide_le: new Date().toISOString(),
      decision_note: note || "Annulée",
    });
    if (n === 0) return { ok: false, error: "Cette absence n'existe plus." };
    revalidatePath("/pointage/absences");
    revalidatePath("/pointage/ecarts");
    revalidatePath("/pointage");
    return { ok: true, message: "Absence annulée. Le solde est rendu." };
  } catch (e) {
    return { ok: false, error: `Annulation impossible : ${String(e).slice(0, 160)}` };
  }
}

/* ── Jours fériés ─────────────────────────────────────────────────────── */

export async function ajouterFerieAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier les jours fériés." };
  }

  const jour = String(formData.get("jour") ?? "").trim();
  const libelle = String(formData.get("libelle") ?? "").trim();
  const centre = String(formData.get("centre") ?? "").trim().toUpperCase();

  if (!DATE.test(jour)) return { ok: false, error: "Indiquez une date." };
  if (!libelle) return { ok: false, error: "Donnez un nom à ce jour férié." };
  if (centre && !["REX", "MIARAKA"].includes(centre)) {
    return { ok: false, error: "Centre inconnu." };
  }

  try {
    await insererFerie({
      jour,
      libelle,
      centre,
      saisi_par: session.user.email ?? "",
      saisi_le: new Date().toISOString(),
    });
    revalidatePath("/pointage/absences/feries");
    revalidatePath("/pointage/absences");
    return { ok: true, message: `${libelle} enregistré au ${jour}.` };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("409") || msg.includes("duplicate")) {
      return { ok: false, error: "Ce jour est déjà déclaré férié." };
    }
    return { ok: false, error: `Enregistrement impossible : ${msg.slice(0, 160)}` };
  }
}

export async function supprimerFerieAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier les jours fériés." };
  }
  const jour = String(formData.get("jour") ?? "").trim();
  const centre = String(formData.get("centre") ?? "").trim().toUpperCase();
  if (!DATE.test(jour)) return { ok: false, error: "Date invalide." };

  try {
    /* Le CENTRE fait partie de la clé : filtrer sur le seul jour
       supprimerait aussi le férié de l'autre centre, alors que la ligne
       cliquée n'en désignait qu'un. */
    await sbDelete("pointage", "feries", { jour: `eq.${jour}`, centre: `eq.${centre}` });
    revalidatePath("/pointage/absences/feries");
    revalidatePath("/pointage/absences");
    return { ok: true, message: "Jour férié retiré." };
  } catch (e) {
    return { ok: false, error: `Suppression impossible : ${String(e).slice(0, 160)}` };
  }
}

/* ── Compteur de congés ───────────────────────────────────────────────── */

/**
 * Fixe la date d'entrée et le report d'une personne.
 *
 * Ces deux valeurs ne se calculent pas : la date d'entrée précède
 * l'application, et le report vient des registres papier. Sans elles, tout
 * solde affiché serait une invention. L'écran des soldes montre donc un
 * tiret tant qu'elles manquent, plutôt qu'un chiffre.
 */
export async function majCompteurAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:absences-valider")) {
    return { ok: false, error: "Seule la direction peut fixer un droit à congés." };
  }

  const agentId = String(formData.get("agentId") ?? "").trim();
  const dateEntree = String(formData.get("dateEntree") ?? "").trim();
  const dateSortie = String(formData.get("dateSortie") ?? "").trim();
  const reporteBrut = String(formData.get("reporte") ?? "0").trim().replace(",", ".");
  const reporte = Number(reporteBrut);

  if (!agentId) return { ok: false, error: "Personne inconnue." };
  if (dateEntree && !DATE.test(dateEntree)) return { ok: false, error: "Date d'entrée invalide." };
  if (dateSortie && !DATE.test(dateSortie)) return { ok: false, error: "Date de sortie invalide." };
  if (dateEntree && dateSortie && dateSortie < dateEntree) {
    return { ok: false, error: "La sortie précède l'entrée." };
  }
  if (!Number.isFinite(reporte)) return { ok: false, error: "Report invalide." };
  if (Math.abs(reporte) > 400) return { ok: false, error: "Report hors limites : vérifiez la saisie." };

  const ligne = {
    agent_id: agentId,
    date_entree: dateEntree,
    date_sortie: dateSortie,
    reporte,
    exercice: String(new Date().getUTCFullYear()),
    note: String(formData.get("note") ?? "").trim(),
    modifie_par: session.user.email ?? "",
    modifie_le: new Date().toISOString(),
  };

  try {
    /* La ligne peut exister ou non : on tente la mise à jour, et on insère
       si elle n'a touché personne. Deux requêtes plutôt qu'un `upsert`, qui
       demanderait un en-tête PostgREST que le client maison n'expose pas. */
    const n = await sbUpdate("pointage", "conges_compteurs", { agent_id: `eq.${agentId}` }, ligne);
    if (n === 0) await sbInsert("pointage", "conges_compteurs", [ligne]);
    revalidatePath("/pointage/absences");
    revalidatePath(`/pointage/agents/${agentId}`);
    return { ok: true, message: "Droit à congés mis à jour." };
  } catch (e) {
    return { ok: false, error: `Enregistrement impossible : ${String(e).slice(0, 160)}` };
  }
}

/** Absences d'une personne, pour l'écran de déclaration. */
export async function absencesDeAction(agentId: string): Promise<Absence[]> {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "pointage:absences")) return [];
  return absencesAgent(agentId);
}
