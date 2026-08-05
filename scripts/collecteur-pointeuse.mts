#!/usr/bin/env node
/**
 * COLLECTEUR RÉSEAU — récupère les pointages directement depuis une
 * pointeuse ZKTeco MB360 sur le réseau local (protocole TCP, port 4370),
 * et les pousse dans Supabase par le MÊME pipeline idempotent que l'import
 * de fichier (id déterministe → relancer n'ajoute aucun doublon).
 *
 * À exécuter depuis un poste BRANCHÉ sur le réseau du centre : Vercel est
 * hébergé hors du LAN et ne peut pas joindre une machine locale. C'est donc
 * un outil de poste, déclenché par le responsable (choix 1a : la voie
 * fichier reste disponible, ce collecteur est le raccourci « bouton »).
 *
 * Usage :
 *   npx tsx scripts/collecteur-pointeuse.mts --ip=192.168.8.21 --site=REX
 *   npx tsx scripts/collecteur-pointeuse.mts --ip=192.168.8.21 --site=REX --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

// Doit précéder toute création de ZKLib : rétablit la lecture complète de
// la mémoire de l'appareil (voir l'en-tête du correctif).
import "./lib/zk-correctif.mjs";

const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { idPointage } = await import("../src/lib/pointage/parseur.ts");

const args = process.argv.slice(2);
const IP = args.find((a) => a.startsWith("--ip="))?.split("=")[1] ?? "192.168.8.21";
const PORT = Number(args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 4370);
const SITE = (args.find((a) => a.startsWith("--site="))?.split("=")[1] ?? "REX").toUpperCase();
const APPLY = args.includes("--apply");
const TIMEOUT = Number(args.find((a) => a.startsWith("--timeout="))?.split("=")[1] ?? 120000);
const ESSAIS = Number(args.find((a) => a.startsWith("--essais="))?.split("=")[1] ?? 6);

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/**
 * Horodatage tel qu'AFFICHÉ SUR LA POINTEUSE, en heure des centres.
 *
 * ⚠️ CORRECTION D'UNE ERREUR COÛTEUSE : ce code lisait auparavant les
 * composants UTC de la Date rendue par node-zklib, ce qui reculait chaque
 * badgeage de trois heures — une arrivée à 08h00 était enregistrée à 05h00,
 * et tout le temps de travail s'en trouvait faussé. La bibliothèque restitue
 * bien l'INSTANT correct ; il faut donc le formater dans le fuseau des
 * centres, et non en extraire l'UTC.
 *
 * Le fuseau est explicite plutôt que laissé au système : l'agent peut tourner
 * sur un poste mal réglé, et une heure de pointage ne doit pas dépendre de la
 * configuration de la machine qui la collecte.
 */
function horodatageLocal(d: Date): string {
  // "sv-SE" rend nativement le format "YYYY-MM-DD HH:MM:SS".
  return d.toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" });
}

/** Bornes de plausibilité, en heure des centres. */
const demain = horodatageLocal(new Date(Date.now() + 86_400_000)).slice(0, 10);
const hier = horodatageLocal(new Date(Date.now() - 86_400_000)).slice(0, 10);

/**
 * Un enregistrement sorti de la mémoire est-il crédible ?
 *
 * Trois signes trahissent un décodage désaligné : un identifiant qui n'est
 * pas un nombre (la pointeuse n'attribue que des numéros), une date
 * antérieure à la mise en service, une date dans le futur. Le même prédicat
 * sert à noter la qualité de chaque essai et à filtrer la lecture retenue —
 * deux critères différents laisseraient passer ce que le premier rejette.
 */
function estPlausible(r: { deviceUserId: string | number; recordTime: string | Date }): boolean {
  if (r?.deviceUserId == null || r?.recordTime == null) return false;
  if (!/^[0-9]+$/.test(String(r.deviceUserId))) return false;
  const h = horodatageLocal(new Date(r.recordTime));
  return h >= "2020-01-01" && h.slice(0, 10) <= demain;
}

console.log(`Connexion à la pointeuse ${IP}:${PORT} (site ${SITE})…`);
// Délai de lecture volontairement large : la mémoire de l'appareil contient
// plus de treize mille passages et se transfère par paquets. Avec un délai
// court, node-zklib rend SANS ERREUR le début du buffer — donc les passages
// les PLUS ANCIENS — et la collecte paraît réussir tout en ne ramenant rien
// du jour. Une troncature silencieuse est pire qu'un échec : elle se voit
// seulement en comparant le nombre lu au compteur de l'appareil (ci-dessous).
const zk = new ZKLib(IP, PORT, TIMEOUT, 8000);
// La connexion est renouvelée entre deux tentatives de lecture ; on garde
// une référence sur celle qui est ouverte pour pouvoir la refermer.
let zkActif = zk;
try {
  await zk.createSocket();
  const info = await zk.getInfo().catch(() => null);
  if (info) console.log(`Appareil joint · ${info.userCounts ?? "?"} utilisateurs · ${info.logCounts ?? "?"} pointages en mémoire`);

  /* ------------------------------------------------------------------
     Lecture avec réessais.

     node-zklib code EN DUR un délai de 10 s entre deux paquets
     (zklibtcp.js, readWithBuffer) — le délai passé au constructeur ne
     s'y applique pas. À l'expiration, la bibliothèque résout la promesse
     avec le buffer PARTIEL et une erreur que getAttendances ne propage
     pas : la collecte semble réussir alors qu'elle n'a ramené que le
     début de la mémoire, donc les passages les plus anciens.

     Les tailles obtenues se suivent par doublements — 1 636, 3 273,
     6 547, 13 284 — signe que la coupure tombe sur une frontière de bloc
     et qu'une lecture complète est atteignable. Il faut en revanche
     ROUVRIR LA CONNEXION entre deux tentatives : la socket ne survit pas
     à plusieurs transferts massifs, et l'enchaînement sur la même finit
     par échouer sèchement.
     ------------------------------------------------------------------ */
  const attendus = Number(info?.logCounts ?? 0);

  /* On garde la MEILLEURE lecture, jamais l'union de plusieurs.
     Fusionner les essais paraissait astucieux — chacun rapportant des blocs
     différents — mais un transfert qui perd un bloc décale le décodage de
     tout ce qui suit : les passages suivants sont alors reconstitués de
     travers, avec des identifiants faits d'octets bruts et des dates
     absurdes. L'essai a produit 14 047 « passages » pour 13 285 en mémoire,
     dont un daté de 2068. Une lecture désalignée n'est pas une lecture
     incomplète : elle est fausse, et rien n'en est récupérable. */
  let data: Array<{ deviceUserId: string | number; recordTime: string | Date }> = [];
  let lecteur = zk;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    if (essai > 1) {
      // Connexion neuve : fermer, souffler, rouvrir.
      await lecteur.disconnect().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      lecteur = new ZKLib(IP, PORT, TIMEOUT, 8000);
      await lecteur.createSocket();
    }
    const lot: Array<{ deviceUserId: string | number; recordTime: string | Date }> = await lecteur
      .getAttendances()
      .then((l: { data?: unknown[] }) => (l?.data ?? []) as typeof lot)
      .catch(() => []);
    /* Une lecture nettement plus grosse que le compteur est désalignée : on
       la rejette au lieu de la retenir pour sa taille (le décodage de
       travers en avait fabriqué 762 de trop). Un léger dépassement, lui,
       est normal — le compteur date du début de la lecture et des gens
       badgent pendant ce temps. */
    const plafond = attendus === 0 ? Infinity : attendus + 100;

    /* On juge la lecture sur ce qu'elle CONTIENT, pas sur sa taille.
       Une lecture peut afficher le bon nombre d'enregistrements et rester
       fausse : un bloc perdu décale le décodage, et la suite se reconstitue
       en identifiants d'octets bruts et en dates absurdes. Un essai a ainsi
       rapporté 13 631 « passages » sur 13 632 annoncés — le compte parfait —
       dont 3 811 invalides, et dont la période s'arrêtait au 2 juin.
       Deux exigences, donc : la quasi-totalité doit passer les contrôles de
       plausibilité, et la lecture doit atteindre les jours récents — c'est
       la fin de la mémoire qui nous intéresse, elle est ce qu'on vient
       chercher et ce qui se perd en premier. */
    const valides = lot.filter((r) => estPlausible(r));
    const dernier = valides.reduce((max, r) => {
      const h = horodatageLocal(new Date(r.recordTime));
      return h > max ? h : max;
    }, "");
    const propre = lot.length > 0 && valides.length >= lot.length * 0.98;
    const aJour = dernier.slice(0, 10) >= hier;
    const assezGros = lot.length >= (attendus === 0 ? 1 : attendus - 10) && lot.length <= plafond;

    if (propre && valides.length > data.length && lot.length <= plafond) data = lot;

    const complet = propre && aJour && assezGros;
    console.log(
      `Essai ${essai}/${ESSAIS} : ${lot.length} lus` +
        (attendus ? `/${attendus}` : "") +
        ` · ${valides.length} valides · jusqu'au ${dernier.slice(0, 10) || "—"}` +
        (complet ? " ✅" : ` — ${!propre ? "décodage douteux" : !aJour ? "n'atteint pas les jours récents" : "incomplet"}`),
    );
    if (complet) break;
  }
  zkActif = lecteur;
  
  console.log(`\n${data.length} pointages retenus depuis la mémoire de l'appareil.`);

  /* Garde-fou final, sur les deux mêmes exigences que la boucle : le compte
     doit rejoindre celui de l'appareil, ET la lecture doit atteindre les
     jours récents. Le second point est le plus important : la mémoire se lit
     du plus ancien au plus récent, donc ce qui se perd est toujours la fin —
     précisément les journées qu'on vient chercher. */
  const dernierJour = data.reduce((max, r) => {
    const h = horodatageLocal(new Date(r.recordTime)).slice(0, 10);
    return h > max && h <= demain ? h : max;
  }, "");
  const tropCourt = attendus > 0 && data.length < attendus - 10;
  const tropVieux = dernierJour < hier;
  if (tropCourt || tropVieux) {
    console.error(
      `\n⚠️  LECTURE INEXPLOITABLE : ${data.length} passages lus sur ${attendus} annoncés, ` +
        `le plus récent datant du ${dernierJour || "—"}.` +
        `\n   ${tropVieux ? "Les journées récentes manquent." : "Le transfert s'est arrêté en route."}` +
        `\n   Relancez la collecte ; si l'échec persiste, branchez le poste en Ethernet` +
        `\n   plutôt qu'en Wi-Fi — le transfert de la mémoire y est bien plus sûr.\n`,
    );
    if (APPLY) {
      console.error("Enregistrement annulé : mieux vaut aucune donnée qu'une journée incomplète.");
      await zkActif.disconnect();
      process.exit(1);
    }
  }

  const pointages = data
    .map((r) => {
      const dt = new Date(r.recordTime);
      const horodatage = horodatageLocal(dt);
      const idPointeuse = String(r.deviceUserId);
      const brut = { idPointeuse, prenom: "", horodatage, jour: horodatage.slice(0, 10), appareil: SITE, sensBrut: "none", verif: "" };
      return {
        id: idPointage(brut, SITE),
        agent_id: `AG-${SITE}-${idPointeuse}`,
        site_pointage: SITE,
        horodatage,
        jour: horodatage.slice(0, 10),
        sens_brut: "none",
        verif: "",
        appareil: SITE,
        source: "collecteur",
        importe_le: new Date().toISOString(),
        _idPointeuse: idPointeuse,
      };
    })
    // La lecture renvoie un bloc de mémoire dont la fin est du remplissage :
    // enregistrements sans agent, horodatés à la date zéro (1999-12-31).
    // Les retenir créerait des agents fantômes et des journées absurdes.
    /* Mêmes bornes que estPlausible, appliquées à la lecture retenue.
       Seule la borne basse existait, contre le remplissage de fin de mémoire
       daté de 1999. Un décodage désaligné produit aussi des dates dans le
       futur : un passage daté du 9 janvier 2068 a ainsi été enregistré, avec
       un identifiant fait d'octets bruts. Un badgeage postérieur à demain
       n'existe pas ; on refuse plutôt que de faire confiance.
       L'identifiant doit par ailleurs être numérique — c'est ce que la
       pointeuse attribue, et un désalignement se trahit d'abord là. */
    .filter(
      (p) =>
        /^[0-9]+$/.test(p._idPointeuse) &&
        p.horodatage >= "2020-01-01" &&
        p.horodatage <= demain,
    );

  const jours = [...new Set(pointages.map((p) => p.jour))].sort();
  console.log(`Période : ${jours[0] ?? "—"} → ${jours.at(-1) ?? "—"} · ${new Set(pointages.map((p) => p._idPointeuse)).size} agents distincts`);

  if (!APPLY) {
    console.log("\n(lecture seule — relancez avec --apply pour enregistrer)");
    await zkActif.disconnect();
    process.exit(0);
  }

  // Créer les agents/badges manquants, puis insérer les pointages neufs.
  const agentsExistants: Array<{ id: string }> = await pg("GET", "agents?select=id&limit=5000");
  const idsAgents = new Set(agentsExistants.map((a) => a.id));
  const badgesExistants: Array<{ id: string }> = await pg("GET", "badges?select=id&limit=5000");
  const idsBadges = new Set(badgesExistants.map((b) => b.id));
  const now = new Date().toISOString();
  const nvAgents = new Map<string, Record<string, unknown>>();
  const nvBadges = new Map<string, Record<string, unknown>>();
  for (const p of pointages) {
    if (!idsAgents.has(p.agent_id) && !nvAgents.has(p.agent_id))
      nvAgents.set(p.agent_id, { id: p.agent_id, nom: "", prenom: `Agent ${p._idPointeuse}`, site: SITE, statut: "salarie", poste: "", service: "", horaire_id: "std", taux_horaire: 0, actif: true, createdat: now });
    const bId = `BDG-${SITE}-${p._idPointeuse}`;
    if (!idsBadges.has(bId) && !nvBadges.has(bId))
      nvBadges.set(bId, { id: bId, agent_id: p.agent_id, installation: SITE, id_pointeuse: p._idPointeuse, valide_du: "", valide_au: "", note: "Créé par le collecteur réseau" });
  }
  if (nvAgents.size) await pg("POST", "agents", [...nvAgents.values()]);
  if (nvBadges.size) await pg("POST", "badges", [...nvBadges.values()]);

  const connus = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const page: Array<{ id: string }> = await pg("GET", `pointages?select=id&order=id.asc&limit=1000&offset=${off}`);
    page.forEach((r) => connus.add(r.id));
    if (page.length < 1000) break;
  }
  const aInserer = pointages.filter((p) => !connus.has(p.id)).map(({ _idPointeuse, ...rest }) => rest);
  for (let i = 0; i < aInserer.length; i += 500) await pg("POST", "pointages", aInserer.slice(i, i + 500));

  await pg("POST", "imports", [{
    id: `IMP-COLL-${Date.now().toString(36).toUpperCase()}`, site: SITE, fichier: `collecteur ${IP}`,
    lignes_lues: data.length, lignes_creees: aInserer.length, lignes_ignorees: pointages.length - aInserer.length,
    anomalies: "", auteur_email: "collecteur", timestamp: now,
  }]);

  console.log(`\n✅ ${aInserer.length} pointages ajoutés · ${nvAgents.size} agents créés · ${pointages.length - aInserer.length} déjà présents`);
  await zkActif.disconnect();
} catch (e) {
  console.error("\n❌ Connexion impossible :", String(e).slice(0, 200));
  console.error("   Vérifiez : poste branché sur le réseau du centre · IP/port corrects · pointeuse allumée.");
  try { await zkActif.disconnect(); } catch {}
  process.exit(1);
}
