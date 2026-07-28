"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { creerPlanning, majPlanning, genererToken } from "@/lib/planning/data";
import { estValidateur } from "@/lib/planning/validation";

export type PlanningResult = { ok: true; id: string; token?: string } | { ok: false; error: string };

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

  const token = /^[a-f0-9]{32}$/.test(tokenExistant) ? tokenExistant : genererToken();
  const maintenant = new Date().toISOString();
  try {
    await majPlanning(id, {
      statut: "publie",
      token_public: token,
      publie_par: session.user.email ?? "",
      publie_le: maintenant,
      modifie_le: maintenant,
    });
    revalidatePath("/pointage/planning");
    return { ok: true, id, token };
  } catch (e) {
    return { ok: false, error: `Publication impossible : ${String(e).slice(0, 150)}` };
  }
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
    return { ok: true, id };
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
  const token = /^[a-f0-9]{32}$/.test(tokenExistant) ? tokenExistant : genererToken();
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
