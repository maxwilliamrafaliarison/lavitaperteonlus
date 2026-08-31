import { randomBytes } from "node:crypto";

import { envoyerMail } from "@/lib/mail";
import { sbSelect, sbInsert, sbUpdate } from "@/lib/supabase-server";
import { listParametresPlanning } from "./data";

/* ============================================================
   AVIS DE MODIFICATION D'UN PLANNING PUBLIÉ
   ============================================================

   Un planning publié a été diffusé au personnel : des gens ont noté leurs
   horaires, se sont organisés. Le modifier ensuite est légitime, cela
   arrive, mais cela ne peut pas se faire en silence.

   ── POURQUOI UN RÉCAPITULATIF, ET NON UN AVIS PAR RETOUCHE ───────────────
   La première version envoyait un courriel par créneau touché. Une séance
   de corrections en produisait dix : l'avis se noyait dans son propre bruit
   et finissait par être ignoré, ce qui est pire que pas d'avis du tout. Les
   modifications s'accumulent donc, et partent en UN message.

   ── POURQUOI PAS UNE TÂCHE PLANIFIÉE ─────────────────────────────────────
   Ce serait la voie normale. L'offre d'hébergement plafonne le nombre de
   tâches, et les deux places servent déjà les rapports de la pharmacie. Le
   déclenchement passe donc par trois chemins qui se rattrapent l'un
   l'autre :

     · le navigateur, qui sait quand on cesse de modifier et demande l'envoi
       après un silence de quelques minutes ;
     · la modification suivante, qui vide d'abord la file si elle a mûri ;
     · l'ouverture de la page des plannings, filet de sécurité pour le cas
       où l'onglet se ferme avant la fin du délai.

   Aucun n'est suffisant seul ; ensemble, ils couvrent les cas réels. Et la
   file étant persistée, rien ne se perd si tout échoue : l'avis part plus
   tard, jamais jamais.

   ── L'ENVOI NE CONDITIONNE JAMAIS LA MODIFICATION ────────────────────────
   Une panne de messagerie ne doit ni empêcher de corriger un planning, ni
   faire croire que la correction a échoué. Les appelants ignorent le
   résultat.
   ============================================================ */

/** Silence après lequel la file part, en minutes. */
export const DELAI_REGROUPEMENT_MINUTES = 4;

/** À défaut de paramètre : ceux qui répondent du planning des deux centres. */
const DESTINATAIRES_PAR_DEFAUT = [
  "direction.lavitaperte@gmail.com",
  "compta.lavitaperte@gmail.com",
  "jimrakotondravelo@gmail.com",
  "informatique.lavitaperte@gmail.com",
];

const SCHEMA = "planning";
const estEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export interface ModificationPlanning {
  planningId: string;
  centre: string;
  libellePlanning: string;
  auteur: string;
  nature: string;
  agentId?: string;
  agentNom: string;
  jour: string;
  detail: string;
  avant?: string;
  lien?: string;
}

export interface LigneModif {
  id: string;
  planning_id: string;
  centre: string;
  auteur: string;
  nature: string;
  agent_id: string;
  agent_nom: string;
  jour: string;
  avant: string;
  detail: string;
  horodatage: string;
  notifie_le: string | null;
}

async function destinataires(): Promise<string[]> {
  try {
    const params = await listParametresPlanning();
    const brut = params.find((p) => p.cle === "email_planning_destinataires")?.valeur ?? "";
    const liste = brut.split(/[,;]/).map((e) => e.trim()).filter(estEmail);
    if (liste.length) return liste;
  } catch {
    // Paramètre illisible : on retombe sur la liste tenue ici.
  }
  return DESTINATAIRES_PAR_DEFAUT;
}

function nomDe(email: string): string {
  const avant = (email || "").split("@")[0] ?? "";
  const brut = avant.split(".")[0] || avant || "quelqu'un";
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function jourLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return jour;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const heureLocale = (iso: string) =>
  new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(11, 16);

/**
 * Met une modification dans la file, sans rien envoyer.
 *
 * Écrire d'abord et envoyer ensuite : si l'envoi échoue, la modification
 * reste annoncée à la prochaine occasion plutôt que perdue.
 */
export async function consignerModification(m: ModificationPlanning): Promise<void> {
  try {
    await sbInsert(SCHEMA, "modifications", [
      {
        id: `MOD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex")}`,
        planning_id: m.planningId,
        centre: m.centre,
        auteur: m.auteur,
        nature: m.nature,
        agent_id: m.agentId ?? "",
        agent_nom: m.agentNom,
        jour: m.jour,
        avant: m.avant ?? "",
        detail: m.detail,
        horodatage: new Date().toISOString(),
        notifie_le: null,
      },
    ]);
  } catch {
    /* ── DÉGRADER VERS L'ANCIEN COMPORTEMENT, JAMAIS VERS LE SILENCE ─────
       La file suppose la table `planning.modifications`, créée par la
       migration 022. Tant qu'elle n'existe pas, consigner échoue, et sans
       ce repli, plus AUCUNE notification ne partirait, ce qui serait pire
       que l'avis par retouche qu'on cherchait à remplacer. On envoie donc
       l'avis seul, comme avant, jusqu'à ce que la table soit là. */
    await envoyerAvisUnique(m);
  }
}

/** Avis portant UNE modification : repli tant que la file n'existe pas. */
async function envoyerAvisUnique(m: ModificationPlanning): Promise<void> {
  try {
    const ligne: LigneModif = {
      id: "", planning_id: m.planningId, centre: m.centre, auteur: m.auteur,
      nature: m.nature, agent_id: m.agentId ?? "", agent_nom: m.agentNom,
      jour: m.jour, avant: m.avant ?? "", detail: m.detail,
      horodatage: new Date().toISOString(), notifie_le: null,
    };
    await envoyerMail({
      destinataires: await destinataires(),
      sujet: `Planning ${m.centre} modifié après publication : ${m.agentNom}, ${jourLisible(m.jour)}`,
      html: htmlRecapitulatif([ligne], new Map([[m.planningId, { libelle: m.libellePlanning, token_public: "" }]])),
      expediteurLabel: "Planning · La Vita Per Te",
    });
  } catch {
    // Journalisé côté hébergeur ; la modification est enregistrée.
  }
}

const C = {
  encre: "#111318", texte: "#3F4651", second: "#6B7280", mention: "#8E959E",
  filet: "#E4E7EB", surface: "#F7F8FA", page: "#EEF1F3", blanc: "#FFFFFF",
  rouge: "#E30613", turquoise: "#0E7C72",
};
const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Composition du récapitulatif, exportée.
 *
 * Un document qu'on ne peut relire qu'en se le faisant envoyer se corrige
 * toujours trop tard : sorti de son envoi, il s'affiche et se vérifie. Même
 * raison que pour les documents de la pharmacie.
 */
export function htmlRecapitulatif(
  lignes: LigneModif[],
  plannings: Map<string, { libelle: string; token_public: string }>,
): string {
  const auteurs = [...new Set(lignes.map((l) => l.auteur).filter(Boolean))];
  const parPlanning = new Map<string, LigneModif[]>();
  for (const l of lignes) (parPlanning.get(l.planning_id) ?? parPlanning.set(l.planning_id, []).get(l.planning_id)!).push(l);

  const sections = [...parPlanning]
    .map(([id, ls]) => {
      const p = plannings.get(id);
      const rangs = ls
        .sort((a, b) => a.jour.localeCompare(b.jour) || a.horodatage.localeCompare(b.horodatage))
        .map(
          (l) => `<tr>
            <td style="padding:7px 10px 7px 0;border-bottom:1px solid ${C.filet};font-size:12px;color:${C.second};white-space:nowrap">${esc(jourLisible(l.jour))}</td>
            <td style="padding:7px 10px 7px 0;border-bottom:1px solid ${C.filet};font-size:13px"><strong>${esc(l.agent_nom)}</strong></td>
            <td style="padding:7px 0;border-bottom:1px solid ${C.filet};font-size:12px;color:${C.texte}">
              ${esc(l.nature)}${l.avant ? ` · <span style="color:${C.second};text-decoration:line-through">${esc(l.avant)}</span>` : ""} → <strong>${esc(l.detail)}</strong>
              <span style="color:${C.mention}"> · ${esc(heureLocale(l.horodatage))}</span>
            </td>
          </tr>`,
        )
        .join("");
      return `
      <div style="margin-top:22px">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.turquoise};padding-bottom:5px;border-bottom:1px solid ${C.filet}">
          ${esc(p?.libelle ?? id)}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:6px">${rangs}</table>
        ${
          p?.token_public
            ? `<p style="margin:8px 0 0;font-size:12px"><a href="https://lavitaperteonlus.vercel.app/planning/${esc(p.token_public)}" style="color:${C.rouge}">Voir ce planning tel que le personnel le lit</a></p>`
            : ""
        }
      </div>`;
    })
    .join("");

  const n = lignes.length;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.page}">
 <tr><td align="center" style="padding:20px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${C.blanc};border:1px solid ${C.filet};border-radius:4px">
   <tr><td style="padding:26px 30px 30px;font-family:${POLICE};color:${C.encre};font-size:14px;line-height:1.55">

    <div style="font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.turquoise}">
      Plannings publiés · modifications
    </div>
    <div style="height:3px;background:${C.rouge};margin:10px 0 16px;font-size:0;line-height:0">&nbsp;</div>

    <p style="margin:0 0 4px;font-size:15px;font-weight:600">
      ${n} modification${n > 1 ? "s" : ""} sur ${parPlanning.size} planning${parPlanning.size > 1 ? "s" : ""} déjà publié${parPlanning.size > 1 ? "s" : ""}
    </p>
    <p style="margin:0;font-size:13px;color:${C.second}">
      Par ${esc(auteurs.map(nomDe).join(", ") || "quelqu'un")}. Le personnel a déjà consulté ces
      plannings : prévenez les personnes concernées si le changement les touche aujourd'hui.
    </p>

    ${sections}

    <div style="margin-top:26px;padding-top:12px;border-top:1px solid ${C.filet}">
      <p style="margin:0;font-size:10px;color:${C.mention};line-height:1.6">
        Récapitulatif envoyé après ${DELAI_REGROUPEMENT_MINUTES} minutes sans nouvelle
        modification, pour ne pas produire un courriel par créneau touché. Les plannings en
        brouillon ne déclenchent rien : ils n'ont été diffusés à personne.
      </p>
      <p style="margin:4px 0 0;font-size:10px;color:${C.mention};line-height:1.6">
        Destinataires modifiables dans le paramètre « email_planning_destinataires ».
      </p>
    </div>

   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

/**
 * Envoie le récapitulatif si la file a mûri, et la marque envoyée.
 *
 * `forcer` court-circuite le délai : c'est le navigateur qui l'emploie, sur
 * un silence qu'il a lui-même mesuré. Les autres chemins d'appel s'en
 * remettent au délai, faute de savoir si la personne a fini.
 */
export async function envoyerRecapitulatif(
  forcer = false,
): Promise<{ envoye: boolean; lignes: number }> {
  try {
    const { rows } = await sbSelect<LigneModif>(SCHEMA, "modifications", {
      select: "*",
      order: "horodatage.asc",
      limit: 500,
      filters: { notifie_le: "is.null" },
    });
    if (rows.length === 0) return { envoye: false, lignes: 0 };

    if (!forcer) {
      const derniere = Date.parse(rows[rows.length - 1].horodatage);
      const mure = Date.now() - derniere >= DELAI_REGROUPEMENT_MINUTES * 60_000;
      if (!mure) return { envoye: false, lignes: rows.length };
    }

    const ids = [...new Set(rows.map((r) => r.planning_id))];
    const { rows: plans } = await sbSelect<{ id: string; libelle: string; token_public: string }>(
      SCHEMA,
      "plannings",
      {
        select: "id,libelle,token_public",
        order: "id.asc",
        limit: 200,
        filters: { id: `in.(${ids.map((i) => `"${i}"`).join(",")})` },
      },
    );
    const parId = new Map(plans.map((p) => [p.id, { libelle: p.libelle, token_public: p.token_public }]));

    const centres = [...new Set(rows.map((r) => r.centre).filter(Boolean))].join(" et ");
    const envoi = await envoyerMail({
      destinataires: await destinataires(),
      sujet: `Planning ${centres || "publié"} : ${rows.length} modification${rows.length > 1 ? "s" : ""} après publication`,
      html: htmlRecapitulatif(rows, parId),
      expediteurLabel: "Planning · La Vita Per Te",
    });
    if (!envoi.envoye) return { envoye: false, lignes: rows.length };

    /* Marquées APRÈS l'envoi : un échec laisse la file intacte, et l'avis
       repart à la prochaine occasion plutôt que de disparaître. */
    const maintenant = new Date().toISOString();
    for (const r of rows) {
      await sbUpdate(SCHEMA, "modifications", { id: `eq.${r.id}` }, { notifie_le: maintenant });
    }
    return { envoye: true, lignes: rows.length };
  } catch {
    return { envoye: false, lignes: 0 };
  }
}
