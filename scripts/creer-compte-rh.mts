#!/usr/bin/env node
/**
 * CRÉATION DU COMPTE RH — RAZANAMARO Annitha Claudette.
 *
 * Rôle `rh` : l'app Pointage et rien d'autre. Consulter la présence et les
 * états, collecter les badgeages — les corrections et la validation des
 * heures supplémentaires restent à l'administrateur (elles engagent la paie).
 *
 * Le mot de passe imprimé ici est PROVISOIRE : le changement est imposé à la
 * première connexion, la valeur transmise par message ne survit pas.
 *
 * Usage : npx tsx scripts/creer-compte-rh.mts --apply
 */
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

import bcrypt from "bcryptjs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "logistique", "Content-Profile": "logistique" };

const COMPTE = {
  email: "reshum.lavitaperte@gmail.com",
  name: "RAZANAMARO Annitha Claudette",
  role: "rh",
  lang: "fr",
};

/** Alphabet sans caractères ambigus : le mot de passe sera recopié à la main. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const motDePasse = Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// Jamais deux comptes pour un même email : on vérifie avant d'insérer.
const lu = await fetch(`${U}/rest/v1/users?select=id,name,role,active&email=eq.${COMPTE.email}`, {
  headers: { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "logistique" },
});
const existants = await lu.json();
if (!lu.ok) {
  console.error(`❌ Lecture impossible : ${lu.status}`);
  process.exit(1);
}
if (existants.length > 0) {
  console.error(`⚠️  Le compte existe déjà : ${JSON.stringify(existants[0])}`);
  console.error("   Pour régénérer son mot de passe, passer par scripts/preparer-livraison.mts.");
  process.exit(1);
}

if (!APPLY) {
  console.log(`(simulation — relancez avec --apply)\n${COMPTE.name} <${COMPTE.email}> rôle ${COMPTE.role}`);
  process.exit(0);
}

const r = await fetch(`${U}/rest/v1/users`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: COMPTE.email,
    passwordHash: await bcrypt.hash(motDePasse, 12),
    name: COMPTE.name,
    role: COMPTE.role,
    lang: COMPTE.lang,
    active: true,
    createdAt: new Date().toISOString(),
    invitedBy: "informatique.lavitaperte@gmail.com",
    mustChangePassword: true,
  }),
});
if (!r.ok) {
  console.error(`❌ Insertion refusée : ${r.status} ${(await r.text()).slice(0, 200)}`);
  process.exit(1);
}

console.log("✅ Compte créé\n");
console.log(`${COMPTE.name}`);
console.log(`  identifiant  : ${COMPTE.email}`);
console.log(`  mot de passe : ${motDePasse}  (provisoire — changement imposé à la 1re connexion)`);
console.log(`  rôle         : Ressources humaines (app Pointage uniquement)`);
