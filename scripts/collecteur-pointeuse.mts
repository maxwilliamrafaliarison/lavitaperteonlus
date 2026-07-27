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

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/** "2026-07-27T08:11:10..." (Date de zklib) → "YYYY-MM-DD HH:MM:SS" local. */
function horodatageLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  // La pointeuse renvoie l'heure locale ; on la garde telle quelle (le
  // temps de travail se juge à l'heure du centre, pas en UTC).
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

console.log(`Connexion à la pointeuse ${IP}:${PORT} (site ${SITE})…`);
const zk = new ZKLib(IP, PORT, 10000, 4000);
try {
  await zk.createSocket();
  const info = await zk.getInfo().catch(() => null);
  if (info) console.log(`Appareil joint · ${info.userCounts ?? "?"} utilisateurs · ${info.logCounts ?? "?"} pointages en mémoire`);

  const logs = await zk.getAttendances();
  const data: Array<{ deviceUserId: string | number; recordTime: string | Date }> = logs?.data ?? [];
  console.log(`${data.length} pointages lus depuis la mémoire de l'appareil.`);

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
    .filter((p) => p.horodatage && p._idPointeuse);

  const jours = [...new Set(pointages.map((p) => p.jour))].sort();
  console.log(`Période : ${jours[0] ?? "—"} → ${jours.at(-1) ?? "—"} · ${new Set(pointages.map((p) => p._idPointeuse)).size} agents distincts`);

  if (!APPLY) {
    console.log("\n(lecture seule — relancez avec --apply pour enregistrer)");
    await zk.disconnect();
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
  await zk.disconnect();
} catch (e) {
  console.error("\n❌ Connexion impossible :", String(e).slice(0, 200));
  console.error("   Vérifiez : poste branché sur le réseau du centre · IP/port corrects · pointeuse allumée.");
  try { await zk.disconnect(); } catch {}
  process.exit(1);
}
