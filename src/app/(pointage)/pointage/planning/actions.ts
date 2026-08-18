"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  creerPlanning,
  majPlanning,
  genererToken,
  listPlannings,
  listAffectations,
  listCreneaux,
  listServices,
  listParametresPlanning,
  tokenDuCentre,
} from "@/lib/planning/data";
import {
  lireExigences,
  trousCritiques,
  resumerTrous,
  EXIGENCES_DEFAUT,
} from "@/lib/planning/postes-critiques";
import { estValidateur, VALIDATEURS } from "@/lib/planning/validation";
import { envoyerMail } from "@/lib/mail";

export type PlanningResult =
  | { ok: true; id: string; token?: string; avertissement?: string }
  /* `trous` accompagne un refus de publication : l'appelant sait alors quoi
     montrer, et peut proposer de passer outre en saisissant un motif. */
  | { ok: false; error: string; trous?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;


/** Crée un planning (brouillon) pour un centre et une période. */
export async function creerPlanningAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de créer un planning." };
  }

  const centre = String(formData.get("centre") ?? "").toUpperCase();
  const du = String(formData.get("du") ?? "").trim();
  const au = String(formData.get("au") ?? "").trim();
  const libelle = String(formData.get("libelle") ?? "").trim();

  if (!["REX", "MIARAKA"].includes(centre)) return { ok: false, error: "Centre inconnu." };
  if (!DATE.test(du) || !DATE.test(au)) return { ok: false, error: "Dates invalides." };
  if (au < du) return { ok: false, error: "La date de fin précède la date de début." };

  const id = `PLN-${centre}-${du.replace(/-/g, "")}`;
  const maintenant = new Date().toISOString();
  try {
    await creerPlanning({
      id,
      centre,
      du,
      au,
      libelle: libelle || `Planning ${centre} du ${du} au ${au}`,
      statut: "brouillon",
      token_public: "",
      publie_par: "",
      publie_le: "",
      modifie_par: session.user.email ?? "",
      modifie_le: maintenant,
      note: "",
    });
    revalidatePath("/pointage/planning");
    return { ok: true, id };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("409") || msg.includes("duplicate")) {
      return { ok: false, error: "Un planning existe déjà pour ce centre à cette date." };
    }
    return { ok: false, error: `Création impossible : ${msg.slice(0, 150)}` };
  }
}

/**
 * Publie un planning et lui attribue un lien de consultation.
 *
 * Le jeton n'est engendré qu'à la publication : tant que le planning est en
 * brouillon, aucune adresse ne permet de l'atteindre. Republier conserve le
 * lien déjà communiqué au personnel — sinon chaque correction obligerait à
 * rediffuser une nouvelle adresse, et les gens consulteraient une version
 * périmée en croyant l'inverse.
 */
export async function publierPlanningAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de publier un planning." };
  }
  if (!estValidateur(session.user.role, session.user.email)) {
    return {
      ok: false,
      error: "La publication requiert la validation de la direction : utilisez « Soumettre à validation ».",
    };
  }

  const id = String(formData.get("id") ?? "").trim();
  const tokenExistant = String(formData.get("token") ?? "").trim();
  if (!id) return { ok: false, error: "Planning inconnu." };

  /* ── LE SEUL REFUS DE TOUT LE MODULE ─────────────────────────────────
     Publier, c'est annoncer la semaine au personnel. Une semaine où la
     garde de nuit de MIARAKA, ou la sécurité et l'accueil de REX, n'ont
     personne ne doit pas partir sans que quelqu'un l'ait vu et assumé.
     On ne bloque JAMAIS la saisie — seulement l'annonce, et le motif
     saisi lève le refus tout en restant écrit sur le planning. */
  const motif = String(formData.get("motif") ?? "").trim().slice(0, 300);
  const trous = await trousDuPlanning(id).catch(() => []);
  if (trous.length > 0 && !motif) {
    const resume = resumerTrous(trous);
    return {
      ok: false,
      error: `Un poste critique n'est tenu par personne : ${resume}. Complétez le planning, ou publiez en indiquant pourquoi ce poste reste vide.`,
      trous: resume,
    };
  }

  /* LE LIEN NE CHANGE JAMAIS. Le jeton appartient au CENTRE : on reprend
     celui de ses plannings précédents, et une nouvelle semaine publiée
     s'ajoute simplement derrière la même adresse. Publier semaine par
     semaine n'oblige donc plus à rediffuser un lien tous les lundis — et
     l'ancien lien cesse d'afficher une semaine périmée sans le dire. */
  const plansDuCentre = await listPlannings().catch(() => []);
  const centre = plansDuCentre.find((p) => p.id === id)?.centre ?? "";
  const token =
    (/^[a-f0-9]{32}$/.test(tokenExistant) ? tokenExistant : "") ||
    (centre ? await tokenDuCentre(centre).catch(() => "") : "") ||
    genererToken();
  const maintenant = new Date().toISOString();
  try {
    await majPlanning(id, {
      statut: "publie",
      token_public: token,
      publie_par: session.user.email ?? "",
      publie_le: maintenant,
      modifie_le: maintenant,
      /* Le motif reste attaché au planning : une dérogation dont personne
         ne retrouve la raison six mois plus tard n'en est pas une. */
      ...(motif && trous.length
        ? { note: `Publié malgré un poste vide (${resumerTrous(trous)}) — ${motif}` }
        : {}),
    });
    revalidatePath("/pointage/planning");
    return {
      ok: true,
      id,
      token,
      ...(trous.length ? { avertissement: `Publié malgré : ${resumerTrous(trous)}` } : {}),
    };
  } catch (e) {
    return { ok: false, error: `Publication impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Postes critiques laissés vides sur toute la période d'un planning.
 *
 * La règle vit dans `planning.parametres` sous la clé
 * `postes_critiques_<CENTRE>` : la direction peut la changer sans qu'on
 * redéploie. À défaut, on retombe sur ce qu'elle a énoncé le 13 août 2026.
 */
async function trousDuPlanning(planningId: string) {
  const [plannings, affectations, creneaux, services, parametres] = await Promise.all([
    listPlannings(),
    listAffectations(planningId),
    listCreneaux(),
    listServices(),
    listParametresPlanning(),
  ]);
  const planning = plannings.find((p) => p.id === planningId);
  if (!planning) return [];

  const cle = `postes_critiques_${planning.centre.toUpperCase()}`;
  const brut =
    parametres.find((p) => p.cle === cle)?.valeur ?? EXIGENCES_DEFAUT[planning.centre.toUpperCase()];
  const libelles = new Map<string, string>([
    ...services.map((s) => [s.id, s.libelle] as [string, string]),
    ["garde_nuit", "Garde de nuit"],
  ]);
  const exigences = lireExigences(brut, libelles);
  if (!exigences.length) return [];

  const typeDe = new Map(creneaux.map((c) => [c.id, c.type]));
  const jours: string[] = [];
  for (let j = planning.du; j <= planning.au; ) {
    jours.push(j);
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    j = d.toISOString().slice(0, 10);
  }

  return trousCritiques(
    jours,
    affectations.map((a) => ({
      jour: a.jour,
      serviceId: a.service_id,
      creneauType: typeDe.get(a.creneau_id) ?? "",
      repos: typeDe.get(a.creneau_id) === "repos",
      sansTitulaire: a.agent_id.startsWith("__attente-"),
    })),
    exigences,
  );
}

/** Soumet un brouillon à la validation de la direction. */
export async function soumettreValidationAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de soumettre un planning." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Planning inconnu." };
  const maintenant = new Date().toISOString();
  try {
    await majPlanning(id, {
      statut: "a_valider",
      modifie_par: session.user.email ?? "",
      modifie_le: maintenant,
      note: `Soumis à validation par ${session.user.email ?? "?"} le ${maintenant.slice(0, 16).replace("T", " ")}`,
    });
    revalidatePath("/pointage/planning");

    // La validatrice est prévenue par courriel. L'échec d'envoi ne remet pas
    // en cause la soumission — le planning EST soumis ; on le signale
    // simplement au préparateur pour qu'il prévienne autrement.
    const courriel = await envoyerMail({
      destinataires: VALIDATEURS,
      sujet: `Planning à valider — ${id}`,
      expediteurLabel: "Planning — La Vita Per Te",
      html: `
        <p>Bonjour,</p>
        <p><strong>${session.user.name ?? session.user.email ?? "Le responsable administratif"}</strong>
        vient de soumettre un planning à votre validation :</p>
        <p style="margin:12px 0;padding:10px 14px;border-left:3px solid #E30613;background:#f7f7f7">
          <strong>${id}</strong><br/>
          Soumis le ${maintenant.slice(0, 16).replace("T", " ")} (UTC)
        </p>
        <p>Pour l'examiner puis le valider ou le renvoyer :<br/>
        <a href="https://lavitaperteonlus.vercel.app/pointage/planning/gerer">Gérer les plannings</a></p>
        <p style="color:#777;font-size:12px">Message automatique — le planning n'est visible du personnel
        qu'après votre validation.</p>`,
    });
    return {
      ok: true,
      id,
      avertissement: courriel.envoye
        ? undefined
        : `Soumis, mais la notification à la direction n'est pas partie (${courriel.detail}) — prévenez-la autrement.`,
    };
  } catch (e) {
    return { ok: false, error: `Soumission impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Valide un planning soumis et le PUBLIE dans le même geste : une validation
 * qui ne publierait pas obligerait la validatrice à deux clics pour un seul
 * acte, et laisserait exister un état « validé mais invisible » ambigu.
 */
export async function validerPlanningAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!estValidateur(session.user.role, session.user.email)) {
    return { ok: false, error: "Seule la direction désignée peut valider un planning." };
  }
  const id = String(formData.get("id") ?? "").trim();
  const tokenExistant = String(formData.get("token") ?? "").trim();
  if (!id) return { ok: false, error: "Planning inconnu." };
  /* ── LE SEUL REFUS DE TOUT LE MODULE ─────────────────────────────────
     Publier, c'est annoncer la semaine au personnel. Une semaine où la
     garde de nuit de MIARAKA, ou la sécurité et l'accueil de REX, n'ont
     personne ne doit pas partir sans que quelqu'un l'ait vu et assumé.
     On ne bloque JAMAIS la saisie — seulement l'annonce, et le motif
     saisi lève le refus tout en restant écrit sur le planning. */
  const motif = String(formData.get("motif") ?? "").trim().slice(0, 300);
  const trous = await trousDuPlanning(id).catch(() => []);
  if (trous.length > 0 && !motif) {
    const resume = resumerTrous(trous);
    return {
      ok: false,
      error: `Un poste critique n'est tenu par personne : ${resume}. Complétez le planning, ou publiez en indiquant pourquoi ce poste reste vide.`,
      trous: resume,
    };
  }

  /* LE LIEN NE CHANGE JAMAIS. Le jeton appartient au CENTRE : on reprend
     celui de ses plannings précédents, et une nouvelle semaine publiée
     s'ajoute simplement derrière la même adresse. Publier semaine par
     semaine n'oblige donc plus à rediffuser un lien tous les lundis — et
     l'ancien lien cesse d'afficher une semaine périmée sans le dire. */
  const plansDuCentre = await listPlannings().catch(() => []);
  const centre = plansDuCentre.find((p) => p.id === id)?.centre ?? "";
  const token =
    (/^[a-f0-9]{32}$/.test(tokenExistant) ? tokenExistant : "") ||
    (centre ? await tokenDuCentre(centre).catch(() => "") : "") ||
    genererToken();
  const maintenant = new Date().toISOString();
  try {
    await majPlanning(id, {
      statut: "publie",
      token_public: token,
      publie_par: session.user.email ?? "",
      publie_le: maintenant,
      modifie_le: maintenant,
      note: `Validé par ${session.user.email ?? "?"} le ${maintenant.slice(0, 16).replace("T", " ")}`,
    });
    revalidatePath("/pointage/planning");
    return { ok: true, id, token };
  } catch (e) {
    return { ok: false, error: `Validation impossible : ${String(e).slice(0, 150)}` };
  }
}

/** Renvoie un planning soumis en brouillon, avec le motif du refus. */
export async function renvoyerBrouillonAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!estValidateur(session.user.role, session.user.email)) {
    return { ok: false, error: "Seule la direction désignée peut renvoyer un planning." };
  }
  const id = String(formData.get("id") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  if (!id) return { ok: false, error: "Planning inconnu." };
  const maintenant = new Date().toISOString();
  try {
    await majPlanning(id, {
      statut: "brouillon",
      modifie_par: session.user.email ?? "",
      modifie_le: maintenant,
      note: `Renvoyé en brouillon par ${session.user.email ?? "?"}${motif ? ` — ${motif}` : ""}`,
    });
    revalidatePath("/pointage/planning");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: `Renvoi impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Révoque le lien public : le planning redevient un brouillon et l'adresse
 * diffusée cesse de fonctionner. Utile si le lien a circulé hors du centre.
 */
export async function revoquerLienAction(formData: FormData): Promise<PlanningResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de révoquer un lien." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Planning inconnu." };
  try {
    await majPlanning(id, {
      statut: "brouillon",
      token_public: "",
      modifie_par: session.user.email ?? "",
      modifie_le: new Date().toISOString(),
    });
    revalidatePath("/pointage/planning");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: `Révocation impossible : ${String(e).slice(0, 150)}` };
  }
}
