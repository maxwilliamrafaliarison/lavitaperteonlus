import { envoyerMail } from "@/lib/mail";
import { listParametresPlanning } from "./data";

/* ============================================================
   NOTIFICATION D'UNE MODIFICATION DE PLANNING PUBLIÉ
   ============================================================

   Un planning publié a été diffusé au personnel : des gens ont noté leurs
   horaires, se sont organisés. Le modifier ensuite est légitime, cela
   arrive, mais cela ne peut pas se faire en silence.

   ── CE QUI A CHANGÉ DANS LA RÈGLE ────────────────────────────────────────
   Modifier un planning publié était REFUSÉ, sauf à le renvoyer d'abord en
   brouillon. La contrainte était juste dans son intention et fausse dans
   ses effets : elle transformait une correction d'une minute en une
   procédure, ce qui pousse à tenir le vrai planning ailleurs. La direction
   a tranché pour la trace plutôt que pour le blocage, ce qui est déjà la
   règle du reste du module : « l'outil signale, il ne bloque jamais ».

   Le blocage devient donc une notification, adressée à ceux qui répondent
   du planning. Le geste reste possible, il cesse d'être discret.

   ── L'ENVOI NE CONDITIONNE JAMAIS LA MODIFICATION ────────────────────────
   Une panne de messagerie ne doit ni empêcher de corriger un planning, ni
   faire croire que la correction a échoué. L'appelant ignore le résultat.
   ============================================================ */

/** À défaut de paramètre : ceux qui répondent du planning des deux centres. */
const DESTINATAIRES_PAR_DEFAUT = [
  "direction.lavitaperte@gmail.com",
  "compta.lavitaperte@gmail.com",
  "jimrakotondravelo@gmail.com",
  "informatique.lavitaperte@gmail.com",
];

const estEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

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

/** « Aliniaina » à partir d'une adresse, faute de mieux. */
function nomDe(email: string): string {
  const avant = (email || "").split("@")[0] ?? "";
  const brut = avant.split(".")[0] || avant || "quelqu'un";
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function jourLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return jour;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

export interface ModificationPlanning {
  planningId: string;
  centre: string;
  libellePlanning: string;
  /** Adresse de l'auteur, telle qu'elle figure en session. */
  auteur: string;
  /** « Créneau ajouté », « Affectation retirée », « Créneau déplacé »… */
  nature: string;
  agentNom: string;
  jour: string;
  /** Ce qui vaut désormais : « 07:00 → 12:00 », ou une phrase. */
  detail: string;
  /** Ce qui valait avant, quand la modification remplace quelque chose. */
  avant?: string;
  /** Adresse publique du planning, si elle existe. */
  lien?: string;
}

const C = {
  encre: "#111318", texte: "#3F4651", second: "#6B7280", mention: "#8E959E",
  filet: "#E4E7EB", surface: "#F7F8FA", page: "#EEF1F3", blanc: "#FFFFFF",
  rouge: "#E30613", turquoise: "#0E7C72",
};
const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function corps(m: ModificationPlanning, quand: string): string {
  const ligne = (g: string, d: string) =>
    `<tr><td style="padding:7px 0;font-size:13px;color:${C.texte}">${g}</td>
       <td align="right" style="padding:7px 0;font-size:13px;color:${C.encre}">${d}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.page}">
 <tr><td align="center" style="padding:20px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${C.blanc};border:1px solid ${C.filet};border-radius:4px">
   <tr><td style="padding:26px 30px 30px;font-family:${POLICE};color:${C.encre};font-size:14px;line-height:1.55">

    <div style="font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.turquoise}">
      Planning publié modifié · ${esc(m.centre)}
    </div>
    <div style="height:3px;background:${C.rouge};margin:10px 0 16px;font-size:0;line-height:0">&nbsp;</div>

    <p style="margin:0 0 4px;font-size:15px;font-weight:600">${esc(m.nature)}</p>
    <p style="margin:0 0 18px;font-size:13px;color:${C.second}">
      ${esc(nomDe(m.auteur))} a modifié un planning déjà diffusé au personnel, le ${esc(quand)}.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${C.surface};border:1px solid ${C.filet};border-radius:3px">
     <tr><td style="padding:6px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
       ${ligne("Personne", `<strong>${esc(m.agentNom)}</strong>`)}
       ${ligne("Jour", esc(jourLisible(m.jour)))}
       ${m.avant ? ligne("Avant", `<span style="color:${C.second};text-decoration:line-through">${esc(m.avant)}</span>`) : ""}
       ${ligne("Désormais", `<strong>${esc(m.detail)}</strong>`)}
       ${ligne("Planning", esc(m.libellePlanning))}
       ${ligne("Par", esc(m.auteur))}
      </table>
     </td></tr>
    </table>

    ${
      m.lien
        ? `<p style="margin:18px 0 0;font-size:13px">
             <a href="${esc(m.lien)}" style="color:${C.rouge}">Ouvrir le planning tel que le personnel le voit</a>
           </p>`
        : ""
    }

    <div style="margin-top:24px;padding-top:12px;border-top:1px solid ${C.filet}">
      <p style="margin:0;font-size:10px;color:${C.mention};line-height:1.6">
        Ce message part automatiquement à chaque modification d'un planning DÉJÀ PUBLIÉ. Les
        plannings en brouillon se modifient librement et sans notification : rien n'a encore été
        diffusé au personnel.
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
 * Prévient d'une modification apportée à un planning publié.
 *
 * Sans effet sur l'appelant : l'échec n'est ni propagé ni signalé, la
 * modification étant déjà enregistrée quand cette fonction s'exécute.
 */
export async function notifierModificationPlanning(m: ModificationPlanning): Promise<void> {
  try {
    const quand = new Date(Date.now() + 3 * 3600 * 1000)
      .toISOString()
      .slice(0, 16)
      .replace("T", " à ");
    await envoyerMail({
      destinataires: await destinataires(),
      sujet: `Planning ${m.centre} modifié après publication : ${m.agentNom}, ${jourLisible(m.jour)}`,
      html: corps(m, quand),
      expediteurLabel: "Planning · La Vita Per Te",
    });
  } catch {
    // Journalisé côté hébergeur ; la modification, elle, est enregistrée.
  }
}
