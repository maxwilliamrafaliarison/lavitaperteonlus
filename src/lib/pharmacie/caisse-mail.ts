import { envoyerMail } from "@/lib/mail";
import { listParametres } from "@/lib/pharmacie/sheets";

import type { EtatCaisse } from "./caisse-etat";
import type { EntiteLegale } from "./entite";
import { chargerEntite, numeroPiece, MENTION_CONSERVATION, MENTION_DEVISE } from "./entite";
import {
  bouton, chiffres, encadre, entete, enveloppe, esc, fmtAr as ar,
  lignes, para, pied, section, tableau, titre, type Ton,
} from "./mail-modele";

/* ============================================================
   COURRIEL D'ÉTAT DE CAISSE — à chaque clôture
   ============================================================

   L'état part à l'administration au moment où le tiroir est compté, pas le
   lendemain : un écart se recherche à chaud, quand on se souvient encore de
   la journée.

   L'envoi est SANS EFFET SUR LA CLÔTURE. Une panne de messagerie ne doit ni
   empêcher de fermer la caisse, ni faire croire que la clôture a échoué —
   les espèces, elles, ont bien été comptées. L'appelant ignore donc le
   résultat, et le courriel n'est qu'un porteur de nouvelles.
   ============================================================ */

/** Destinataire par défaut : la responsable administrative du centre. */
const DESTINATAIRE_PAR_DEFAUT = "compta.lavitaperte@gmail.com";

const estEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function nomDe(email: string): string {
  const avant = (email || "").split("@")[0] ?? "";
  const brut = avant.split(".")[0] || avant || "—";
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function heure(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Indian/Antananarivo",
  });
}

/**
 * Destinataires de l'état de caisse.
 *
 * Ordre de préséance : le paramètre dédié, sinon celui des rapports, sinon
 * l'administration. Le repli garantit qu'un état de caisse ne se perd jamais
 * faute de configuration — c'est une pièce comptable, elle doit arriver.
 */
async function destinataires(): Promise<string[]> {
  let params: Map<string, string>;
  try {
    params = await listParametres();
  } catch {
    return [DESTINATAIRE_PAR_DEFAUT];
  }
  const brut =
    params.get("email_caisse_destinataires")?.trim() ||
    params.get("email_rapports_destinataires")?.trim() ||
    "";
  const liste = brut
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(estEmail);
  return liste.length > 0 ? liste : [DESTINATAIRE_PAR_DEFAUT];
}


/**
 * Composition du relevé, séparée de son envoi.
 *
 * Un document qu'on ne peut relire qu'en se l'envoyant se corrige toujours
 * trop tard. Exporté, il s'affiche hors messagerie et se teste.
 */
export function htmlEtatCaisse(
  etat: EtatCaisse,
  entite: EntiteLegale,
  numero: string,
  baseUrl: string,
): string {
  const s = etat.session;
  const ecart = etat.ecart ?? 0;
  /* Trois états, trois teintes, et chacune une phrase. Un écart nul se dit
     autrement qu'un manque, et un excédent autrement qu'un manque : le
     tiroir contient alors plus que les ventes enregistrées, ce qui désigne
     une vente non saisie et non un vol. */
  const ton: Ton = ecart === 0 ? "bon" : ecart < 0 ? "critique" : "vigilance";
  const verdict =
    ecart === 0
      ? "Le compte tombe juste."
      : ecart < 0
        ? "Il manque des espèces par rapport aux ventes enregistrées."
        : "Le tiroir contient plus que les ventes enregistrées : une vente a pu ne pas être saisie.";

  const jour = new Date(s.ouverte_le).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });

  return enveloppe(`
${entete(entite)}
${titre("Relevé de caisse journalier", `${jour} · Pharmacie, centre ${esc(s.site)} · période ${heure(s.ouverte_le)} → ${heure(s.fermee_le)}`, numero)}

${/* Les DEUX nombres qu'on compare, et eux seuls. L'écart figurait ici en
     troisième cellule et à nouveau dans l'encadré qui suit : le répéter
     n'ajoutait rien, alors que le montant des ventes manquait. */ ""}
${chiffres([
  { etiquette: "Total théorique", valeur: ar(etat.theorique), detail: `dont ${ar(etat.totalComptant)} de ventes` },
  { etiquette: "Espèces comptées", valeur: ar(etat.comptees ?? 0), detail: `par ${esc(nomDe(s.fermee_par))}` },
])}

${encadre({ etiquette: "Écart constaté", valeur: `${ecart > 0 ? "+" : ""}${ar(ecart)}`, texte: verdict, ton })}

${section("Détail de la séance")}
${lignes([
  ["Ouverte par", `${esc(nomDe(s.ouverte_par))} à ${heure(s.ouverte_le)}`],
  ["Clôturée par", `${esc(nomDe(s.fermee_par))} à ${heure(s.fermee_le)}`],
  ["Fonds initial", ar(s.fonds_initial)],
  [`Ventes comptant (${etat.nbVentesComptant})`, ar(etat.totalComptant)],
  ["Total théorique", ar(etat.theorique), { fort: true, trait: true }],
  ["Espèces comptées", ar(etat.comptees ?? 0), { fort: true }],
])}
${
  etat.nbPec > 0 || etat.nbAnnulees > 0
    ? para(
        [
          etat.nbPec > 0
            ? `${etat.nbPec} prise(s) en charge pour ${ar(etat.valeurPec)}, non encaissées.`
            : "",
          etat.nbAnnulees > 0 ? `${etat.nbAnnulees} vente(s) annulée(s), stock rendu.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        12,
      )
    : ""
}

${
  etat.parOperatrice.length > 0
    ? section("Ventes comptant par personne") +
      tableau(
        ["Personne", "Ventes", "Montant"],
        etat.parOperatrice.map((o) => [esc(o.nom), String(o.nbVentes), ar(o.totalComptant)]),
        [1, 2],
      ) +
      para(
        "Le tiroir est commun : cette répartition indique qui a servi, elle n'impute l'écart à personne.",
        11,
      )
    : ""
}

${s.note ? section("Observation") + para(esc(s.note)) : ""}

${bouton(`${baseUrl}/api/pharmacie/caisse/${s.id}`, "Ouvrir l'état de caisse (PDF)")}

${pied(
  [
    MENTION_DEVISE,
    MENTION_CONSERVATION,
    `Document établi par traitement informatique à partir des ventes enregistrées ; les écritures sont conservées de manière inaltérable et chaque correction reste tracée. Référence interne : séance ${esc(s.id)}.`,
  ],
  entite.incomplete
    ? `Mentions d'immatriculation incomplètes (${entite.manquants.join(", ")}) : à compléter dans les paramètres avant archivage comptable.`
    : undefined,
)}
`);
}

export async function envoyerEtatCaisse(
  etat: EtatCaisse,
  baseUrl: string,
): Promise<{ envoye: boolean; detail: string }> {
  const s = etat.session;
  const [entite, numero] = await Promise.all([
    chargerEntite(s.site),
    numeroPiece(s.id, s.ouverte_le, s.site),
  ]);
  const html = htmlEtatCaisse(etat, entite, numero, baseUrl);
  const ecart = etat.ecart ?? 0;
  const jour = new Date(s.ouverte_le).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });

  const signe = ecart === 0 ? "compte juste" : `écart ${ecart > 0 ? "+" : ""}${ar(ecart)}`;
  return envoyerMail({
    destinataires: await destinataires(),
    sujet: `${numero} · Relevé de caisse ${s.site} du ${jour} : ${signe}`,
    html,
    expediteurLabel: "Pharmacie · La Vita Per Te",
  });
}
