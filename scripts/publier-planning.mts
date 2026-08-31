#!/usr/bin/env node
/**
 * PUBLICATION D'UN PLANNING, HORS NAVIGATEUR.
 *
 * Publier, c'est annoncer la semaine au personnel. Ce script fait donc
 * exactement ce que fait le bouton de l'application, contrôles compris, et
 * non une écriture directe en base qui les contournerait.
 *
 * Deux règles sont reprises telles quelles de `publierPlanningAction` :
 *
 *  · LE POSTE CRITIQUE. Une semaine où la sécurité ou l'accueil de REX, ou
 *    la garde de nuit de MIARAKA, ne sont tenus par personne ne part pas
 *    sans que quelqu'un l'ait vu et assumé. Le refus se lève par un motif,
 *    qui reste écrit sur le planning : une dérogation dont on ne retrouve
 *    plus la raison six mois plus tard n'en est pas une.
 *
 *  · LE LIEN NE CHANGE JAMAIS. Le jeton appartient au CENTRE. On reprend
 *    celui de ses plannings déjà publiés, et la semaine nouvelle s'ajoute
 *    derrière la même adresse. Sans cela, il faudrait rediffuser un lien
 *    tous les lundis, et l'ancien afficherait une semaine périmée sans le
 *    dire.
 *
 * Ce que le script NE reprend pas, c'est le contrôle d'identité : le
 * navigateur sait qui clique, pas lui. L'appelant doit donc être habilité
 * à valider, ce que `--par=` inscrit noir sur blanc dans `publie_par`.
 *
 * Usage :
 *   npx tsx scripts/publier-planning.mts --id=PLN-REX-20260831 --par=…
 *   npx tsx scripts/publier-planning.mts --id=… --par=… --apply
 *   npx tsx scripts/publier-planning.mts --id=… --par=… --motif="…" --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { lireExigences, trousCritiques, resumerTrous, EXIGENCES_DEFAUT } =
  await import("../src/lib/planning/postes-critiques.ts");
const { VALIDATEURS } = await import("../src/lib/planning/validation.ts");

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ID = arg("id");
const PAR = (arg("par") ?? "").toLowerCase();
const MOTIF = (arg("motif") ?? "").trim().slice(0, 300);
/* Pis-aller tant que la migration 021 n'est pas passée : voir plus bas. */
const TRANSFERER = process.argv.includes("--transferer-jeton");
if (!ID) throw new Error("--id= est obligatoire.");
if (!PAR) throw new Error("--par= est obligatoire : la publication doit rester attribuée à quelqu'un.");

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = (s: string) => ({ apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": s, "Content-Profile": s });
async function pg(schema: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr(schema), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const lire = async <T>(table: string, requete: string): Promise<T[]> => {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const p: T[] = await pg("planning", "GET", `${table}?${requete}&limit=1000&offset=${off}`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
};

// ── Habilitation ──────────────────────────────────────────────────────────
/* Le rôle vient de la base, comme dans l'application. La règle est celle de
   `estValidateur` : la direction désignée, ou un administrateur en secours,
   parce qu'un circuit qui se bloque quand la validatrice est absente pousse
   à le contourner. */
const [utilisateur]: Array<{ email: string; role: string; name: string }> =
  await pg("logistique", "GET", `users?select=email,role,name&email=eq.${encodeURIComponent(PAR)}`);
if (!utilisateur) throw new Error(`Compte « ${PAR} » inconnu.`);
const habilite = utilisateur.role === "admin" || VALIDATEURS.includes(PAR);
console.log(`Publication demandée par ${utilisateur.name} (${utilisateur.role})`);
if (!habilite) {
  console.error(`❌ ${PAR} ne peut pas publier : la validation revient à la direction (${VALIDATEURS.join(", ")}) ou à un administrateur.`);
  process.exit(1);
}

// ── Le planning ───────────────────────────────────────────────────────────
const [plan] = await pg("planning", "GET", `plannings?select=*&id=eq.${ID}`);
if (!plan) throw new Error(`Planning ${ID} introuvable.`);
console.log(`${plan.id} · ${plan.centre} · ${plan.du} → ${plan.au} · statut actuel « ${plan.statut} »`);

// ── Contrôle des postes critiques ─────────────────────────────────────────
const [affectations, creneaux, services, parametres] = await Promise.all([
  lire<{ jour: string; service_id: string; creneau_id: string; agent_id: string }>("affectations", `select=jour,service_id,creneau_id,agent_id&planning_id=eq.${ID}&order=jour.asc`),
  lire<{ id: string; type: string }>("creneaux", "select=id,type&order=id.asc"),
  lire<{ id: string; libelle: string }>("services", "select=id,libelle&order=id.asc"),
  lire<{ cle: string; valeur: string }>("parametres", "select=cle,valeur&order=cle.asc"),
]);
const cle = `postes_critiques_${String(plan.centre).toUpperCase()}`;
const brut = parametres.find((p) => p.cle === cle)?.valeur ?? EXIGENCES_DEFAUT[String(plan.centre).toUpperCase()];
const libelles = new Map<string, string>([
  ...services.map((s) => [s.id, s.libelle] as [string, string]),
  ["garde_nuit", "Garde de nuit"],
]);
const exigences = lireExigences(brut, libelles);
const typeDe = new Map(creneaux.map((c) => [c.id, c.type]));
const jours: string[] = [];
for (let j = plan.du; j <= plan.au; ) {
  jours.push(j);
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  j = d.toISOString().slice(0, 10);
}
const trous = exigences.length
  ? trousCritiques(
      jours,
      affectations.map((a) => ({
        jour: a.jour,
        serviceId: a.service_id,
        creneauType: typeDe.get(a.creneau_id) ?? "",
        repos: typeDe.get(a.creneau_id) === "repos",
        sansTitulaire: a.agent_id.startsWith("__attente-"),
      })),
      exigences,
    )
  : [];

console.log(`exigences « ${brut} » · ${affectations.length} affectations · ${jours.length} jours`);
if (trous.length) {
  console.log(`\n⚠ POSTE CRITIQUE VIDE : ${resumerTrous(trous)}`);
  for (const t of trous.slice(0, 20)) console.log("   ", JSON.stringify(t));
  if (!MOTIF) {
    console.error(`\n❌ Publication refusée. Complétez le planning, ou republiez avec --motif="…" en indiquant pourquoi ce poste reste vide.`);
    process.exit(1);
  }
  console.log(`\nmotif fourni : « ${MOTIF} »`);
} else {
  console.log("✅ aucun poste critique vide");
}

// ── Le jeton du centre ────────────────────────────────────────────────────
const publies: Array<{ token_public: string }> = await pg(
  "planning", "GET",
  `plannings?select=token_public&centre=eq.${encodeURIComponent(plan.centre)}&statut=eq.publie&order=publie_le.desc&limit=100`,
);
const token = publies.find((p) => /^[a-f0-9]{32}$/.test(p.token_public))?.token_public
  ?? (plan.token_public && /^[a-f0-9]{32}$/.test(plan.token_public) ? plan.token_public : "")
  ?? "";
if (!token) throw new Error("Aucun jeton public existant pour ce centre : publiez d'abord depuis l'application, qui sait en créer un.");
console.log(`\njeton du centre repris : ${token}`);
console.log(`adresse publique       : https://lavitaperteonlus.vercel.app/planning/${token}`);

if (!APPLY) {
  console.log("\n(simulation : relancez avec --apply)");
  process.exit(0);
}

const maintenant = new Date().toISOString();
const champs = {
  statut: "publie",
  token_public: token,
  publie_par: PAR,
  publie_le: maintenant,
  modifie_le: maintenant,
  ...(MOTIF && trous.length
    ? { note: `Publié malgré un poste vide (${resumerTrous(trous)}) : ${MOTIF}` }
    : {}),
};

try {
  await pg("planning", "PATCH", `plannings?id=eq.${ID}`, champs);
} catch (e) {
  /* ── LA CONTRAINTE QUI CONTREDIT LA CONCEPTION ────────────────────────
     `plannings_token_idx` est UNIQUE depuis la migration 014, quand un
     jeton désignait encore une seule semaine. La publication derrière une
     adresse permanente veut l'inverse : le jeton appartient au centre, et
     chaque semaine s'ajoute derrière. La migration 021 lève l'unicité.

     Tant qu'elle n'est pas passée, on ne peut publier qu'en TRANSFÉRANT le
     jeton à la nouvelle semaine. L'adresse ne change pas, le personnel y
     voit bien la semaine en cours ; ce qu'on perd, c'est la navigation
     vers les semaines déjà publiées, qui quittent l'adresse une à une.
     C'est un pis-aller, il porte donc un nom et se demande à la main. */
  if (!String(e).includes("23505")) throw e;
  const [ancien]: Array<{ id: string; du: string; au: string }> = await pg(
    "planning", "GET",
    `plannings?select=id,du,au&token_public=eq.${token}&limit=1`,
  );
  if (!TRANSFERER) {
    console.error(`\n❌ Le jeton est déjà porté par ${ancien?.id} (${ancien?.du} → ${ancien?.au}).`);
    console.error("   L'index unique de la migration 014 interdit qu'une adresse serve deux semaines.");
    console.error("   Passez la migration 021, ou relancez avec --transferer-jeton pour la lui reprendre.");
    process.exit(1);
  }
  console.log(`\n⚠ jeton repris à ${ancien?.id} (${ancien?.du} → ${ancien?.au}), qui quitte l'adresse publique.`);
  await pg("planning", "PATCH", `plannings?id=eq.${ancien.id}`, {
    token_public: "",
    modifie_le: maintenant,
    note: `Jeton public transféré au planning du ${plan.du} le ${maintenant.slice(0, 10)}, faute de la migration 021.`,
  });
  await pg("planning", "PATCH", `plannings?id=eq.${ID}`, champs);
}
console.log(`\n✅ ${ID} publié par ${PAR}`);
console.log(`   https://lavitaperteonlus.vercel.app/planning/${token}`);
