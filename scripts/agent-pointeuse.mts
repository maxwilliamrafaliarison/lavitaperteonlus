#!/usr/bin/env node
/**
 * AGENT LOCAL DE COLLECTE — passerelle entre l'application et la pointeuse.
 *
 * ── POURQUOI CE PROGRAMME EXISTE ─────────────────────────────────────────
 * L'application est hébergée sur Vercel, hors du réseau du centre : son
 * serveur ne peut pas joindre 192.168.8.21. Le navigateur ne le peut pas non
 * plus — le protocole ZKTeco est du TCP binaire, pas du HTTP, et une page web
 * n'ouvre pas de socket brut. Un bouton qui « récupère les données » a donc
 * besoin d'un intermédiaire tournant SUR PLACE.
 *
 * Cet agent est cet intermédiaire : lancé sur un poste du centre, il écoute en
 * local, interroge la pointeuse et pousse les pointages vers Supabase par le
 * même pipeline idempotent que l'import de fichier.
 *
 * Le navigateur autorise une page en HTTPS à appeler http://localhost : les
 * adresses locales sont considérées comme sûres, c'est l'exception qui rend
 * ce montage possible.
 *
 * Usage (sur un poste branché au réseau du centre) :
 *   npx tsx scripts/agent-pointeuse.mts
 *   → écoute sur http://localhost:7331
 */
import { createServer } from "node:http";
import { Socket } from "node:net";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { idPointage } = await import("../src/lib/pointage/parseur.ts");

const PORT = Number(process.env.AGENT_PORT ?? 7331);
/** Pointeuses connues : le site est déduit de l'adresse, jamais deviné. */
const POINTEUSES: Record<string, { ip: string; port: number }> = {
  REX: { ip: process.env.POINTEUSE_REX_IP ?? "192.168.8.21", port: 4370 },
  MIARAKA: { ip: process.env.POINTEUSE_MIARAKA_IP ?? "", port: 4370 },
};

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

/** L'heure de la pointeuse est locale ; zklib l'étiquette « Z » à tort. */
function horodatageLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Le port répond-il ? Test TCP brut, avec un délai qui expire vraiment.
 *
 * node-zklib annonce un timeout mais ne l'applique pas lorsque l'hôte est
 * totalement injoignable : les paquets sont silencieusement abandonnés, aucun
 * refus n'arrive, et l'appel reste suspendu. C'est précisément le cas d'un
 * poste branché sur un autre réseau — celui où l'utilisateur attend une
 * réponse claire. On tranche donc en amont, avec une socket que l'on ferme
 * soi-même.
 */
function portOuvert(ip: string, port: number, ms = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const fin = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(ms);
    socket.once("connect", () => fin(true));
    socket.once("timeout", () => fin(false));
    socket.once("error", () => fin(false));
    socket.connect(port, ip);
  });
}

/** Teste la joignabilité d'une pointeuse, sans rien collecter. */
async function tester(site: string): Promise<{ joignable: boolean; detail: string; utilisateurs?: number; enMemoire?: number }> {
  const cfg = POINTEUSES[site];
  if (!cfg?.ip) {
    return {
      joignable: false,
      detail:
        `L'adresse de la pointeuse du centre ${site} n'est pas encore renseignée. ` +
        `Ajoutez POINTEUSE_${site}_IP=<adresse> dans le fichier .env.local, puis relancez l'agent.`,
    };
  }

  if (!(await portOuvert(cfg.ip, cfg.port))) {
    return {
      joignable: false,
      detail: `Pointeuse du centre ${site} injoignable à l'adresse ${cfg.ip}. Ce poste n'est pas branché au réseau du centre ${site}, ou l'appareil est éteint.`,
    };
  }

  const zk = new ZKLib(cfg.ip, cfg.port, 6000, 3000);
  try {
    await zk.createSocket();
    const info = await zk.getInfo().catch(() => null);
    await zk.disconnect().catch(() => {});
    return {
      joignable: true,
      detail: `Pointeuse ${site} joignable (${cfg.ip}).`,
      utilisateurs: info?.userCounts,
      enMemoire: info?.logCounts,
    };
  } catch {
    await zk.disconnect().catch(() => {});
    return {
      joignable: false,
      detail: `Pointeuse du centre ${site} injoignable à l'adresse ${cfg.ip}. Vérifiez que ce poste est bien branché au réseau du centre ${site} et que l'appareil est allumé.`,
    };
  }
}

/** Collecte et enregistre. Idempotent : relancer ne duplique rien. */
async function collecter(site: string) {
  const cfg = POINTEUSES[site];
  const zk = new ZKLib(cfg.ip, cfg.port, 15000, 5000);
  await zk.createSocket();
  const logs = await zk.getAttendances();
  await zk.disconnect().catch(() => {});

  const brut: Array<{ deviceUserId: string | number; recordTime: string | Date }> = logs?.data ?? [];
  const now = new Date().toISOString();
  const rows = brut
    .map((r) => {
      const horodatage = horodatageLocal(new Date(r.recordTime));
      const idPointeuse = String(r.deviceUserId ?? "");
      return {
        id: idPointage({ idPointeuse, prenom: "", horodatage, jour: horodatage.slice(0, 10), appareil: site, sensBrut: "none", verif: "" }, site),
        agent_id: `AG-${site}-${idPointeuse}`,
        site_pointage: site,
        horodatage,
        jour: horodatage.slice(0, 10),
        sens_brut: "none",
        verif: "",
        appareil: site,
        source: "agent",
        importe_le: now,
        _id: idPointeuse,
      };
    })
    // Fin de bloc mémoire : enregistrements sans agent, datés de 1999.
    .filter((r) => r._id && r.horodatage >= "2020-01-01");

  // Agents et badges manquants.
  const ag: Array<{ id: string }> = await pg("GET", "agents?select=id&limit=5000");
  const has = new Set(ag.map((a) => a.id));
  const bg: Array<{ id: string }> = await pg("GET", "badges?select=id&limit=5000");
  const hb = new Set(bg.map((b) => b.id));
  const ids = [...new Set(rows.map((r) => r._id))];
  const nvA = ids.filter((i) => !has.has(`AG-${site}-${i}`)).map((i) => ({
    id: `AG-${site}-${i}`, nom: "", prenom: `Agent ${i}`, site, statut: "salarie",
    poste: "", service: "", horaire_id: "std", taux_horaire: 0, actif: true, createdat: now,
  }));
  if (nvA.length) await pg("POST", "agents", nvA);
  const nvB = ids.filter((i) => !hb.has(`BDG-${site}-${i}`)).map((i) => ({
    id: `BDG-${site}-${i}`, agent_id: `AG-${site}-${i}`, installation: site,
    id_pointeuse: i, valide_du: "", valide_au: "", note: "Créé par l'agent local",
  }));
  if (nvB.length) await pg("POST", "badges", nvB);

  // Idempotence : PostgREST plafonne chaque réponse à 1000 lignes.
  const connus = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const page: Array<{ id: string }> = await pg("GET", `pointages?select=id&order=id.asc&limit=1000&offset=${off}`);
    page.forEach((x) => connus.add(x.id));
    if (page.length < 1000) break;
  }
  const aInserer = rows.filter((r) => !connus.has(r.id)).map(({ _id, ...rest }) => rest);
  for (let i = 0; i < aInserer.length; i += 500) await pg("POST", "pointages", aInserer.slice(i, i + 500));

  const jours = [...new Set(rows.map((r) => r.jour))].sort();
  return {
    lus: brut.length,
    ajoutes: aInserer.length,
    dejaPresents: rows.length - aInserer.length,
    agentsCrees: nvA.length,
    du: jours[0] ?? "",
    au: jours[jours.length - 1] ?? "",
  };
}

// ── Serveur local ─────────────────────────────────────────────────────────
const CORS = {
  // L'agent n'expose aucune donnée : il écrit vers Supabase et rend un
  // compte-rendu. Il n'écoute que sur la machine locale.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

const serveur = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const site = (url.searchParams.get("site") ?? "REX").toUpperCase();
  const repondre = (code: number, corps: unknown) => {
    res.writeHead(code, CORS);
    res.end(JSON.stringify(corps));
  };

  try {
    if (url.pathname === "/statut") {
      const t = await tester(site);
      return repondre(t.joignable ? 200 : 503, { ...t, site, version: 1 });
    }
    if (url.pathname === "/collecter") {
      const t = await tester(site);
      if (!t.joignable) return repondre(503, { ok: false, error: t.detail });
      const r = await collecter(site);
      return repondre(200, { ok: true, site, ...r });
    }
    repondre(404, { error: "Chemin inconnu. Utilisez /statut ou /collecter." });
  } catch (e) {
    repondre(500, { ok: false, error: String(e).slice(0, 300) });
  }
});

// Écoute sur la boucle locale uniquement : l'agent ne doit pas être
// atteignable depuis le réseau, il détient la clé d'écriture Supabase.
serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`Agent de collecte prêt sur http://localhost:${PORT}`);
  console.log(`  /statut?site=REX     — teste la liaison avec la pointeuse`);
  console.log(`  /collecter?site=REX  — récupère et enregistre les pointages`);
  console.log(`\nLaissez cette fenêtre ouverte, puis utilisez le bouton dans l'application.`);
});
