/**
 * AGENT LOCAL DU POSTE — rend le bouton « Récupérer les pointages »
 * fonctionnel depuis le navigateur de ce poste.
 *
 * Le navigateur ne sait pas parler à la pointeuse (protocole TCP binaire) :
 * le bouton de l'application appelle donc ce petit serveur local, qui lit
 * l'appareil et ENVOIE les badgeages à l'API de l'application — avec le
 * même secret dédié que la tâche planifiée. Ce poste ne détient toujours
 * PAS la clé de la base : perdre ce fichier ne compromet rien d'autre que
 * le droit de déposer des pointages.
 *
 * Lancé automatiquement à l'ouverture de session (tâche « agent »), il
 * n'écoute que sur la machine elle-même (127.0.0.1).
 */
import { createServer } from "node:http";
import { Socket } from "node:net";
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ICI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

// Rétablit la lecture COMPLÈTE de la mémoire de l'appareil : sans lui, le
// dernier bloc — celui des journées en cours — est perdu sans erreur.
await import("./zk-correctif.mjs");

const config = {};
for (const ligne of readFileSync(join(ICI, "config.txt"), "utf8").split("\n")) {
  const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m && !ligne.trim().startsWith("#")) config[m[1]] = m[2];
}
const { IP_POINTEUSE, SITE, URL_APPLICATION, SECRET } = config;
/* Même fenêtre que la tâche planifiée : voir collecte.mjs. Le bouton sert à
   rattraper les dernières heures, pas à rejouer des années. */
const JOURS = Number(config.JOURS_ENVOYES ?? 30) || 30;
const PORT = 7331;

const log = (msg) => {
  const l = `${new Date().toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" })}  [agent] ${msg}`;
  console.log(l);
  try { appendFileSync(join(ICI, "collecte.log"), l + "\n"); } catch {}
};

const horodatageLocal = (d) => d.toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" });

/** Test TCP à délai maîtrisé : node-zklib reste suspendu sur hôte muet. */
function portOuvert(ip, port, ms = 3000) {
  return new Promise((resolve) => {
    const s = new Socket();
    const fin = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(ms);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, ip);
  });
}

/** Bornes de plausibilité, recalculées à chaque appel (l'agent tourne des jours). */
const demain = () => horodatageLocal(new Date(Date.now() + 86_400_000)).slice(0, 10);
const hier = () => horodatageLocal(new Date(Date.now() - 86_400_000)).slice(0, 10);

async function collecter() {
  /* Lecture jugée sur son CONTENU : proportion d'enregistrements plausibles
     et date la plus récente atteinte. Un compte parfait peut être faux — un
     bloc perdu décale le décodage et fabrique des identifiants d'octets
     bruts. La connexion est ROUVERTE entre deux essais : la socket ne
     survit pas à plusieurs transferts massifs. */
  let zk = new ZKLib(IP_POINTEUSE, 4370, 15000, 5000);
  await zk.createSocket();
  const info = await zk.getInfo().catch(() => null);
  const attendus = Number(info?.logCounts ?? 0);

  let brut = [];
  for (let essai = 1; essai <= 6; essai++) {
    if (essai > 1) {
      await zk.disconnect().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      zk = new ZKLib(IP_POINTEUSE, 4370, 15000, 5000);
      await zk.createSocket();
    }
    const lot = (await zk.getAttendances().catch(() => null))?.data ?? [];
    const valides = lot.filter((r) => {
      if (r?.deviceUserId == null || r?.recordTime == null) return false;
      if (!/^[0-9]+$/.test(String(r.deviceUserId))) return false;
      const h = horodatageLocal(new Date(r.recordTime));
      return h >= "2020-01-01" && h.slice(0, 10) <= demain();
    });
    const propre = lot.length > 0 && valides.length >= lot.length * 0.98;
    const dernier = valides.reduce((max, r) => {
      const h = horodatageLocal(new Date(r.recordTime)).slice(0, 10);
      return h > max ? h : max;
    }, "");
    const plafond = attendus === 0 ? Infinity : attendus + 100;
    if (propre && valides.length > brut.length && lot.length <= plafond) brut = valides;
    if (propre && dernier >= hier() && lot.length >= (attendus === 0 ? 1 : attendus - 10) && lot.length <= plafond) break;
  }
  await zk.disconnect().catch(() => {});

  const dernierJour = brut.reduce((max, r) => {
    const h = horodatageLocal(new Date(r.recordTime)).slice(0, 10);
    return h > max ? h : max;
  }, "");
  if ((attendus > 0 && brut.length < attendus - 10) || dernierJour < hier()) {
    throw new Error(
      `Lecture inexploitable : ${brut.length}/${attendus} passages, le plus récent du ${dernierJour || "—"}. ` +
        `Rien n'a été enregistré. Relancez ; si l'échec persiste, préférez l'Ethernet au Wi-Fi.`,
    );
  }

  const depuis = horodatageLocal(new Date(Date.now() - JOURS * 86_400_000)).slice(0, 10);
  const pointages = brut
    .map((r) => ({ id: String(r.deviceUserId ?? ""), horodatage: horodatageLocal(new Date(r.recordTime)) }))
    .filter((p) => p.id && p.horodatage >= "2020-01-01" && p.horodatage >= depuis);

  let ajoutes = 0, dejaPresents = 0;
  for (let i = 0; i < pointages.length; i += 5000) {
    const rep = await fetch(`${URL_APPLICATION.replace(/\/+$/, "")}/api/pointage/collecte`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ site: SITE, pointages: pointages.slice(i, i + 5000) }),
    });
    const corps = await rep.json().catch(() => ({}));
    if (!rep.ok || !corps.ok) throw new Error(`API : ${corps.error ?? `HTTP ${rep.status}`}`);
    ajoutes += corps.ajoutes ?? 0;
    dejaPresents += corps.dejaPresents ?? 0;
  }
  const jours = pointages.map((p) => p.horodatage.slice(0, 10)).sort();
  return { lus: pointages.length, ajoutes, dejaPresents, du: jours[0] ?? "", au: jours.at(-1) ?? "" };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

const serveur = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const repondre = (code, corps) => { res.writeHead(code, CORS); res.end(JSON.stringify(corps)); };
  const siteDemande = (url.searchParams.get("site") ?? SITE).toUpperCase();

  try {
    if (siteDemande !== SITE) {
      return repondre(503, { joignable: false, ok: false, error: `Ce poste ne collecte que le centre ${SITE}.`, detail: `Ce poste ne collecte que le centre ${SITE}.` });
    }
    if (url.pathname === "/statut") {
      const ok = await portOuvert(IP_POINTEUSE, 4370);
      return repondre(ok ? 200 : 503, {
        joignable: ok,
        site: SITE,
        detail: ok
          ? `Pointeuse ${SITE} joignable (${IP_POINTEUSE}).`
          : `Pointeuse du centre ${SITE} injoignable (${IP_POINTEUSE}). Ce poste n'est pas branché au réseau du centre, ou l'appareil est éteint.`,
      });
    }
    if (url.pathname === "/collecter") {
      if (!(await portOuvert(IP_POINTEUSE, 4370))) {
        return repondre(503, { ok: false, error: `Pointeuse du centre ${SITE} injoignable — poste hors réseau ou appareil éteint.` });
      }
      log("collecte demandée depuis le navigateur…");
      const r = await collecter();
      log(`✅ ${r.ajoutes} ajoutés, ${r.dejaPresents} déjà connus.`);
      return repondre(200, { ok: true, site: SITE, ...r });
    }
    repondre(404, { error: "Chemins : /statut, /collecter." });
  } catch (e) {
    log(`❌ ${String(e).slice(0, 200)}`);
    repondre(500, { ok: false, error: String(e).slice(0, 250) });
  }
});

serveur.listen(PORT, "127.0.0.1", () => log(`prêt sur http://localhost:${PORT} (centre ${SITE})`));
