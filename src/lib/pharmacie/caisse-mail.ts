import { envoyerMail } from "@/lib/mail";
import { listParametres } from "@/lib/pharmacie/sheets";

import type { EtatCaisse } from "./caisse-etat";
import { chargerEntite, numeroPiece, MENTION_CONSERVATION, MENTION_DEVISE } from "./entite";

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

function fmtAr(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " Ar";
}

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

export async function envoyerEtatCaisse(
  etat: EtatCaisse,
  baseUrl: string,
): Promise<{ envoye: boolean; detail: string }> {
  const s = etat.session;
  const [entite, numero] = await Promise.all([
    chargerEntite(s.site),
    numeroPiece(s.id, s.ouverte_le, s.site),
  ]);
  const ecart = etat.ecart ?? 0;
  const ton = ecart === 0 ? "#059669" : ecart < 0 ? "#dc2626" : "#d97706";
  const verdict =
    ecart === 0
      ? "Le compte tombe juste."
      : ecart < 0
        ? "Il manque des espèces par rapport aux ventes enregistrées."
        : "Le tiroir contient plus que les ventes enregistrées — une vente a pu ne pas être saisie.";

  const jour = new Date(s.ouverte_le).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });

  const lignesOperatrices = etat.parOperatrice
    .map(
      (o) =>
        `<tr><td style="padding:4px 0;color:#6b7280">${o.nom} — ${o.nbVentes} vente(s)</td>` +
        `<td style="padding:4px 0;text-align:right">${fmtAr(o.totalComptant)}</td></tr>`,
    )
    .join("");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#0a0a0b">
  <div style="padding-bottom:10px;border-bottom:1px solid #e5e7eb;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700">${entite.denomination}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${entite.formeJuridique}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Siège social : ${entite.siegeSocial} · Code fiscal / P. IVA : ${entite.codeFiscal}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Établissement : ${entite.etablissement}${entite.nif ? ` · NIF ${entite.nif}` : ""}${entite.stat ? ` · STAT ${entite.stat}` : ""}</div>
  </div>

  <h2 style="margin:0 0 2px;font-size:18px">Relevé de caisse journalier</h2>
  <p style="margin:0 0 4px;color:#0a0a0b;font-size:13px">Pièce justificative n° <strong>${numero}</strong></p>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px">${jour} · Pharmacie, centre ${s.site} · période ${heure(s.ouverte_le)} → ${heure(s.fermee_le)}</p>

  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="padding:4px 0;color:#6b7280">Ouverte par</td><td style="padding:4px 0;text-align:right">${nomDe(s.ouverte_par)} à ${heure(s.ouverte_le)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280">Clôturée par</td><td style="padding:4px 0;text-align:right">${nomDe(s.fermee_par)} à ${heure(s.fermee_le)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280">Fonds initial</td><td style="padding:4px 0;text-align:right">${fmtAr(s.fonds_initial)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280">Ventes comptant (${etat.nbVentesComptant})</td><td style="padding:4px 0;text-align:right">${fmtAr(etat.totalComptant)}</td></tr>
    <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb;font-weight:600">Total théorique</td><td style="padding:6px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtAr(etat.theorique)}</td></tr>
    <tr><td style="padding:4px 0;font-weight:600">Espèces comptées</td><td style="padding:4px 0;text-align:right;font-weight:600">${fmtAr(etat.comptees ?? 0)}</td></tr>
  </table>

  <div style="margin:14px 0;padding:12px 14px;border-left:3px solid ${ton};background:${ecart === 0 ? "#d1fae5" : ecart < 0 ? "#fee2e2" : "#fef3c7"}">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Écart constaté</div>
    <div style="font-size:22px;font-weight:700;color:${ton};margin-top:2px">${ecart > 0 ? "+" : ""}${fmtAr(ecart)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">${verdict}</div>
  </div>

  ${
    etat.nbPec > 0 || etat.nbAnnulees > 0
      ? `<p style="font-size:12px;color:#6b7280;margin:10px 0">
           ${etat.nbPec > 0 ? `${etat.nbPec} prise(s) en charge pour ${fmtAr(etat.valeurPec)} — non encaissées.` : ""}
           ${etat.nbAnnulees > 0 ? ` ${etat.nbAnnulees} vente(s) annulée(s), stock rendu.` : ""}
         </p>`
      : ""
  }

  ${
    lignesOperatrices
      ? `<h3 style="font-size:13px;margin:16px 0 4px">Ventes comptant par personne</h3>
         <table style="width:100%;border-collapse:collapse;font-size:13px">${lignesOperatrices}</table>
         <p style="font-size:11px;color:#9ca3af;margin:6px 0 0">Le tiroir est commun : cette répartition indique qui a servi, elle n'impute l'écart à personne.</p>`
      : ""
  }

  ${s.note ? `<h3 style="font-size:13px;margin:16px 0 4px">Observation</h3><p style="font-size:13px;margin:0">${s.note}</p>` : ""}

  <p style="margin:20px 0 0">
    <a href="${baseUrl}/api/pharmacie/caisse/${s.id}"
       style="display:inline-block;background:#E30613;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px">
      Ouvrir l'état de caisse (PDF)
    </a>
  </p>
  <div style="margin-top:22px;padding-top:10px;border-top:1px solid #e5e7eb">
    <p style="font-size:10px;color:#9ca3af;line-height:1.6;margin:0">${MENTION_DEVISE}</p>
    <p style="font-size:10px;color:#9ca3af;line-height:1.6;margin:3px 0 0">${MENTION_CONSERVATION}</p>
    <p style="font-size:10px;color:#9ca3af;line-height:1.6;margin:3px 0 0">
      Document établi par traitement informatique à partir des ventes enregistrées ; les écritures
      sont conservées de manière inaltérable et chaque correction reste tracée. Référence interne :
      séance ${s.id}.
    </p>
    ${
      entite.incomplete
        ? `<p style="font-size:10px;color:#dc2626;line-height:1.6;margin:6px 0 0">Mentions d'immatriculation incomplètes (${entite.manquants.join(", ")}) : à compléter dans les paramètres avant archivage comptable.</p>`
        : ""
    }
  </div>
</div>`;

  const signe = ecart === 0 ? "compte juste" : `écart ${ecart > 0 ? "+" : ""}${fmtAr(ecart)}`;
  return envoyerMail({
    destinataires: await destinataires(),
    sujet: `${numero} · Relevé de caisse ${s.site} du ${jour} — ${signe}`,
    html,
    expediteurLabel: "Pharmacie · La Vita Per Te",
  });
}
