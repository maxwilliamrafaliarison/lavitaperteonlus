/* ============================================================
   CHARTE DES DOCUMENTS ENVOYÉS PAR LA PHARMACIE
   ============================================================

   Deux pièces partent de la pharmacie : le récapitulatif de fin de journée,
   qui est un compte rendu d'activité, et le relevé de caisse, qui est une
   pièce comptable conservée dix ans. Elles s'adressent aux mêmes personnes
   et doivent se reconnaître comme d'une même maison. Elles ne se
   ressemblaient pas : l'une portait un en-tête d'entité en règle, l'autre
   des titres à émojis et de l'Arial.

   ── POURQUOI CE MODULE N'EST PAS DU CSS ──────────────────────────────────
   Un courriel n'est pas une page. Les clients de messagerie ignorent les
   variables CSS, retirent les feuilles de style externes, et Outlook ne
   connaît ni flexbox ni grid. Tout tient donc en TABLEAUX et en styles
   posés sur chaque balise, ce qui est laid à écrire et seul à fonctionner
   partout. D'où ces fonctions : la laideur est écrite une fois ici, les
   documents restent lisibles.

   ── LA COULEUR DIT QUELQUE CHOSE, OU ELLE NE SERT PAS ────────────────────
   Le rouge est celui du logo. Il tient le filet sous l'en-tête, et signale
   ce qui appelle une décision. Le turquoise est celui des façades du centre
   et porte la STRUCTURE : filets de section, chiffres clés. Le reste est en
   niveaux de gris. Trois teintes sémantiques, et trois seulement, disent un
   état : conforme, vigilance, critique.

   ── LES MONTANTS ─────────────────────────────────────────────────────────
   L'ariary n'a pas de subdivision décimale en usage. Les nombres sont donc
   entiers, alignés à droite, et jamais coupés en fin de ligne.
   ============================================================ */

export const C = {
  rouge: "#E30613",
  rougeSourd: "#A5050F",
  turquoise: "#0E7C72",
  turquoiseClair: "#EAF5F3",
  encre: "#111318",
  texte: "#3F4651",
  second: "#6B7280",
  mention: "#8E959E",
  filet: "#E4E7EB",
  filetFort: "#C8CDD4",
  surface: "#F7F8FA",
  page: "#EEF1F3",
  blanc: "#FFFFFF",
  bon: "#0F7B4F",
  bonFond: "#E7F5EE",
  vigilance: "#B45309",
  vigilanceFond: "#FDF3E3",
  critique: "#C0111C",
  critiqueFond: "#FCEBEC",
} as const;

export type Ton = "bon" | "vigilance" | "critique" | "neutre";

const TEINTE: Record<Ton, { trait: string; fond: string; texte: string }> = {
  bon: { trait: C.bon, fond: C.bonFond, texte: C.bon },
  vigilance: { trait: C.vigilance, fond: C.vigilanceFond, texte: C.vigilance },
  critique: { trait: C.critique, fond: C.critiqueFond, texte: C.critique },
  neutre: { trait: C.filetFort, fond: C.surface, texte: C.encre },
};

/** Pile de polices système : aucune police web n'est fiable en messagerie. */
const POLICE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const POLICE_CHIFFRES =
  "'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace";

/**
 * Montant en ariary, sans décimale et insécable.
 *
 * L'espace avant « Ar » est un CARACTÈRE insécable, et non l'entité
 * `&nbsp;`. L'entité traverse `esc()`, qui échappe son esperluette et la
 * fait apparaître telle quelle au lecteur : « 24&nbsp;375&nbsp;Ar », ce
 * qu'on a vu à l'écran. Le caractère, lui, passe partout sans rien
 * demander, et les séparateurs de milliers rendus par Intl sont déjà
 * insécables.
 */
export function fmtAr(n: number): string {
  const s = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
  return `${s}\u00A0Ar`;
}

/** Échappe ce qui vient de la base : une désignation peut contenir « & ». */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Enveloppe du document : fond de page, feuille blanche centrée.
 *
 * La largeur est bornée à 600 pixels, seuil au-delà duquel les clients de
 * messagerie se mettent à découper ou à réduire la page sur mobile.
 */
export function enveloppe(contenu: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.page}">
  <tr><td align="center" style="padding:20px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${C.blanc};border:1px solid ${C.filet};border-radius:4px">
      <tr><td style="padding:26px 30px 30px;font-family:${POLICE};color:${C.encre};font-size:14px;line-height:1.55">
${contenu}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * En-tête d'entité, identique sur les deux documents.
 *
 * Une pièce comptable doit porter qui l'émet. Le compte rendu d'activité le
 * porte aussi : il circule hors du centre, et un document sans émetteur
 * n'est opposable à personne.
 */
export function entete(e: {
  denomination: string;
  formeJuridique: string;
  siegeSocial: string;
  codeFiscal?: string;
  etablissement: string;
  nif?: string;
  stat?: string;
}): string {
  const l = (t: string) =>
    `<div style="font-size:11px;color:${C.second};line-height:1.5">${t}</div>`;
  return `
<div style="font-size:14px;font-weight:700;letter-spacing:0.01em;color:${C.encre}">${esc(e.denomination)}</div>
${l(esc(e.formeJuridique))}
${l(`Siège : ${esc(e.siegeSocial)}${e.codeFiscal ? ` · Code fiscal ${esc(e.codeFiscal)}` : ""}`)}
${l(`Établissement : ${esc(e.etablissement)}${e.nif ? ` · NIF ${esc(e.nif)}` : ""}${e.stat ? ` · STAT ${esc(e.stat)}` : ""}`)}
<div style="height:3px;background:${C.rouge};margin:12px 0 0;font-size:0;line-height:0">&nbsp;</div>`;
}

/** Titre du document : sa nature, sa date, et sa référence s'il en a une. */
export function titre(nature: string, sousTitre: string, piece?: string): string {
  return `
<div style="padding-top:18px">
  <div style="font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.turquoise}">${esc(nature)}</div>
  ${piece ? `<div style="font-size:13px;color:${C.encre};margin-top:6px">Pièce justificative n°&nbsp;<strong>${esc(piece)}</strong></div>` : ""}
  <div style="font-size:13px;color:${C.second};margin-top:${piece ? "2px" : "6px"}">${esc(sousTitre)}</div>
</div>`;
}

/** Intertitre : un filet fin, et le mot. Rien de plus. */
export function section(nom: string): string {
  return `
<div style="margin:26px 0 10px;padding-bottom:5px;border-bottom:1px solid ${C.filet}">
  <span style="font-size:11px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;color:${C.turquoise}">${esc(nom)}</span>
</div>`;
}

/**
 * Bandeau de chiffres clés.
 *
 * Trois au plus : au-delà, aucun ne ressort et le lecteur les relit tous.
 * Les cellules se posent côte à côte par un tableau, faute de grille
 * utilisable en messagerie.
 */
export function chiffres(
  items: Array<{ etiquette: string; valeur: string; detail?: string; ton?: Ton }>,
): string {
  if (items.length === 0) return "";
  const largeur = Math.floor(100 / items.length);
  const cellules = items
    .map((x, i) => {
      const t = TEINTE[x.ton ?? "neutre"];
      return `<td width="${largeur}%" valign="top" style="width:${largeur}%;padding:14px 14px;${i > 0 ? `border-left:1px solid ${C.filet};` : ""}">
        <div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.second}">${esc(x.etiquette)}</div>
        <div style="font-size:21px;font-weight:700;color:${x.ton && x.ton !== "neutre" ? t.texte : C.encre};margin-top:5px;font-family:${POLICE_CHIFFRES};letter-spacing:-0.01em">${x.valeur}</div>
        ${x.detail ? `<div style="font-size:11px;color:${C.second};margin-top:4px">${esc(x.detail)}</div>` : ""}
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${C.surface};border:1px solid ${C.filet};border-radius:3px;margin-top:6px"><tr>${cellules}</tr></table>`;
}

/** Suite libellé / valeur : la forme d'un relevé, pas d'un tableau de données. */
export function lignes(items: Array<[string, string, { fort?: boolean; trait?: boolean }?]>): string {
  const corps = items
    .map(([g, d, o]) => {
      const haut = o?.trait ? `border-top:1px solid ${C.filetFort};` : "";
      const poids = o?.fort ? "font-weight:700;" : "";
      return `<tr>
      <td style="padding:7px 0;${haut}font-size:13px;color:${o?.fort ? C.encre : C.texte};${poids}">${g}</td>
      <td align="right" style="padding:7px 0;${haut}font-size:13px;color:${C.encre};${poids}font-family:${POLICE_CHIFFRES};white-space:nowrap">${d}</td>
    </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">${corps}</table>`;
}

/**
 * Tableau de données.
 *
 * `droite` liste les colonnes de nombres : elles s'alignent à droite et
 * passent en chasse fixe, faute de quoi les chiffres ne se comparent pas
 * d'une ligne à l'autre.
 */
export function tableau(
  entetes: string[],
  corps: string[][],
  droite: number[] = [],
): string {
  const th = entetes
    .map(
      (h, i) =>
        `<th align="${droite.includes(i) ? "right" : "left"}" style="padding:0 0 6px;border-bottom:1px solid ${C.filetFort};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.second};${i > 0 ? "padding-left:10px;" : ""}">${esc(h)}</th>`,
    )
    .join("");
  const tr = corps
    .map(
      (l) =>
        `<tr>${l
          .map(
            (c, i) =>
              `<td align="${droite.includes(i) ? "right" : "left"}" style="padding:7px 0;border-bottom:1px solid ${C.filet};font-size:13px;color:${C.encre};${i > 0 ? "padding-left:10px;" : ""}${droite.includes(i) ? `font-family:${POLICE_CHIFFRES};white-space:nowrap;` : ""}">${c}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  /* Un espace au-dessus : un tableau qui touche le paragraphe qui l'annonce
     donne l'impression que l'en-tête de colonne fait partie de la phrase. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:10px"><tr>${th}</tr>${tr}</table>`;
}

/** Encadré de verdict : un état, son chiffre, sa phrase. */
export function encadre(o: { etiquette: string; valeur: string; texte: string; ton: Ton }): string {
  const t = TEINTE[o.ton];
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:16px 0;background:${t.fond};border-left:3px solid ${t.trait};border-radius:0 3px 3px 0">
  <tr><td style="padding:13px 16px">
    <div style="font-size:10px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;color:${C.second}">${esc(o.etiquette)}</div>
    <div style="font-size:23px;font-weight:700;color:${t.texte};margin-top:3px;font-family:${POLICE_CHIFFRES}">${o.valeur}</div>
    <div style="font-size:12px;color:${C.texte};margin-top:5px">${esc(o.texte)}</div>
  </td></tr>
</table>`;
}

/** Paragraphe courant. */
export function para(texte: string, taille = 13): string {
  return `<p style="margin:12px 0 0;font-size:${taille}px;color:${C.texte};line-height:1.6">${texte}</p>`;
}

/** Bouton d'action. Un seul par document : deux se neutralisent. */
export function bouton(href: string, texte: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0"><tr>
    <td style="background:${C.rouge};border-radius:4px"><a href="${esc(href)}" style="display:inline-block;padding:10px 20px;font-family:${POLICE};font-size:13px;font-weight:600;color:${C.blanc};text-decoration:none">${esc(texte)}</a></td>
  </tr></table>`;
}

/** Mentions de bas de document, en corps réduit. */
export function pied(mentions: string[], alerte?: string): string {
  const l = mentions
    .filter(Boolean)
    .map((m) => `<p style="margin:0 0 4px;font-size:10px;color:${C.mention};line-height:1.6">${m}</p>`)
    .join("");
  return `
<div style="margin-top:26px;padding-top:12px;border-top:1px solid ${C.filet}">
  ${l}
  ${alerte ? `<p style="margin:8px 0 0;font-size:10px;color:${C.critique};line-height:1.6">${esc(alerte)}</p>` : ""}
</div>`;
}
