/**
 * COLLECTE PLANIFIÉE — lit la pointeuse et envoie les badgeages à
 * l'application. Conçu pour tourner en tâche planifiée sur un poste du
 * centre (celui d'Aliniaina), sans autre dépendance que Node et node-zklib.
 *
 * SÉCURITÉ : ce poste ne détient PAS la clé de la base de données. Il envoie
 * les pointages à une API de l'application, authentifiée par un secret qui
 * ne permet que ce seul geste — déposer des badgeages. Perdre ce poste ne
 * compromet ni les patients, ni la pharmacie, ni la paie.
 *
 * Relancer ne crée jamais de doublon : le serveur ignore ce qu'il connaît.
 * Configuration dans config.txt, à côté de ce fichier.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

// Rétablit la lecture COMPLÈTE de la mémoire (dernier bloc compris).
await import("./zk-correctif.mjs");

// ── Configuration ─────────────────────────────────────────────────────────
const config = {};
for (const ligne of readFileSync(join(ICI, "config.txt"), "utf8").split("\n")) {
  const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m && !ligne.trim().startsWith("#")) config[m[1]] = m[2];
}
const { IP_POINTEUSE, SITE, URL_APPLICATION, SECRET } = config;
/* FENÊTRE ENVOYÉE. La pointeuse garde des années de mémoire, et la renvoyer
   entière à chaque heure ferait relire au serveur toute sa table pour
   écarter des doublons qu'il connaît depuis longtemps. On n'envoie donc que
   les jours récents. « --tout » lève la borne, pour une première
   installation ou après une longue coupure. */
const TOUT = process.argv.includes("--tout");
const JOURS = Number(config.JOURS_ENVOYES ?? 30) || 30;
if (!IP_POINTEUSE || !SITE || !URL_APPLICATION || !SECRET) {
  console.error("config.txt incomplet : IP_POINTEUSE, SITE, URL_APPLICATION, SECRET requis.");
  process.exit(1);
}

const log = (msg) => {
  const ligne = `${new Date().toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" })}  ${msg}`;
  console.log(ligne);
  try {
    appendFileSync(join(ICI, "collecte.log"), ligne + "\n");
  } catch {}
};

/** L'heure de la pointeuse est locale ; zklib l'étiquette « Z » à tort. */
const horodatageLocal = (d) => d.toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" });

/**
 * Message lisible pour une erreur, d'où qu'elle vienne.
 *
 * node-zklib rejette souvent des OBJETS NUS (`{ err, ip }`, ou ses propres
 * ZKError) plutôt que des Error. `String(e)` en tire alors « [object
 * Object] », qui s'affichait jusque dans le bandeau du navigateur et dans
 * collecte.log. Un message d'erreur qui ne dit rien coûte plus cher qu'une
 * erreur : il fait chercher au mauvais endroit.
 */
function messageErreur(e) {
  if (e == null) return "erreur inconnue";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || String(e);
  if (typeof e === "object") {
    for (const cle of ["message", "err", "error", "reason", "code"]) {
      const v = e[cle];
      if (typeof v === "string" && v) return v;
      if (v instanceof Error && v.message) return v.message;
      if (v && typeof v === "object") {
        const m = v.message ?? v.err ?? v.code;
        if (typeof m === "string" && m) return m;
      }
    }
    try {
      const j = JSON.stringify(e);
      if (j && j !== "{}") return j;
    } catch {}
    const cles = Object.keys(e);
    if (cles.length) return `objet sans message (clés : ${cles.join(", ")})`;
  }
  return String(e);
}


try {
  log(`Connexion à la pointeuse ${SITE} (${IP_POINTEUSE})…`);
  const zk = new ZKLib(IP_POINTEUSE, 4370, 15000, 5000);
  await zk.createSocket();
  const info = await zk.getInfo().catch(() => null);
  const attendus = Number(info?.logCounts ?? 0);

  /* La bibliothèque abandonne la réception 10 s après le dernier paquet et
     rend le buffer PARTIEL sans erreur. La mémoire se lisant du plus ancien
     au plus récent, une lecture tronquée ne contient jamais la journée en
     cours : la tâche paraîtrait réussir en ne remontant rien d'utile. */
  /* DEUX essais, et non plus six. La reprise vit désormais DANS le lecteur,
     qui redemande chaque bloc jusqu'à trois fois. Rejouer la lecture
     entière six fois par-dessus ne corrigerait plus rien et pourrait
     dépasser l'heure qui sépare deux collectes. */
  let brut = [];
  for (let essai = 1; essai <= 2; essai++) {
    const logs = await zk.getAttendances();
    const lot = logs?.data ?? [];
    if (lot.length > brut.length) brut = lot;
    log(`Essai ${essai} : ${lot.length} lus${attendus ? ` / ${attendus} annoncés` : ""}.`);
    if (attendus === 0 || brut.length >= attendus - 10) break;
  }
  await zk.disconnect().catch(() => {});

  if (attendus > 0 && brut.length < attendus - 10) {
    throw new Error(
      `Lecture incomplète : ${brut.length} sur ${attendus}. Les passages les plus récents manquent — ` +
        `rien n'a été enregistré. Vérifiez que le poste est en Ethernet, puis relancez.`,
    );
  }
  const depuis = TOUT
    ? "2020-01-01"
    : horodatageLocal(new Date(Date.now() - JOURS * 86_400_000)).slice(0, 10);
  const pointages = brut
    .map((r) => ({
      id: String(r.deviceUserId ?? ""),
      horodatage: horodatageLocal(new Date(r.recordTime)),
    }))
    .filter((p) => p.id && p.horodatage >= "2020-01-01" && p.horodatage >= depuis);
  log(
    `${brut.length} enregistrements lus, ${pointages.length} envoyés` +
      (TOUT ? " (mémoire entière)." : ` (depuis le ${depuis}).`),
  );

  // Envoi par lots : un envoi unique de 15 000 lignes frôlerait la limite
  // de taille des requêtes.
  let ajoutes = 0;
  let dejaPresents = 0;
  for (let i = 0; i < pointages.length; i += 5000) {
    const lot = pointages.slice(i, i + 5000);
    const rep = await fetch(`${URL_APPLICATION.replace(/\/+$/, "")}/api/pointage/collecte`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ site: SITE, pointages: lot }),
    });
    const corps = await rep.json().catch(() => ({}));
    if (!rep.ok || !corps.ok) {
      throw new Error(`Envoi refusé (HTTP ${rep.status}) : ${corps.error ?? "?"}`);
    }
    ajoutes += corps.ajoutes ?? 0;
    dejaPresents += corps.dejaPresents ?? 0;
  }

  log(`✅ Terminé : ${ajoutes} nouveau(x) pointage(s), ${dejaPresents} déjà connus.`);
} catch (e) {
  log(`❌ ÉCHEC : ${messageErreur(e).slice(0, 300)}`);
  log("   Vérifiez : poste sur le réseau du centre · pointeuse allumée · connexion Internet.");
  process.exit(1);
}
