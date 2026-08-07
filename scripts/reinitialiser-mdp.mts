#!/usr/bin/env node
/**
 * RÉINITIALISATION D'UN MOT DE PASSE PROVISOIRE.
 *
 * Le mot de passe est écrit pour être RECOPIÉ À LA MAIN, souvent lu au
 * téléphone : minuscules et chiffres seulement, groupés par quatre. Les
 * majuscules et les caractères jumeaux (l/1/I, O/0) sont ce qui fait
 * échouer une première connexion, pas la longueur — trois groupes de
 * quatre valent largement quatorze caractères panachés.
 *
 * Le changement reste imposé à la première connexion : la valeur ci-dessous
 * ne sert qu'à ouvrir la porte une fois.
 *
 * Usage : npx tsx scripts/reinitialiser-mdp.mts <email> --apply
 */
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

import bcrypt from "bcryptjs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const EMAIL = process.argv.find((a) => a.includes("@"))?.trim().toLowerCase();
if (!EMAIL) {
  console.error("Usage : npx tsx scripts/reinitialiser-mdp.mts <email> --apply");
  process.exit(1);
}

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");

/** Ni majuscule, ni caractère jumeau : rien qui se lise de deux façons. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const groupe = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const motDePasse = [groupe(), groupe(), groupe()].join("-");

const lu = await fetch(`${U}/rest/v1/users?select=id,name,role,active&email=eq.${EMAIL}`, {
  headers: { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "logistique" },
});
const [compte] = await lu.json();
if (!compte) {
  console.error(`❌ Aucun compte pour ${EMAIL}`);
  process.exit(1);
}

if (!APPLY) {
  console.log(`(simulation) ${compte.name} · rôle ${compte.role} → nouveau mot de passe ${motDePasse}`);
  process.exit(0);
}

const r = await fetch(`${U}/rest/v1/users?email=eq.${EMAIL}`, {
  method: "PATCH",
  headers: {
    apikey: K,
    Authorization: `Bearer ${K}`,
    "Content-Type": "application/json",
    "Content-Profile": "logistique",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    passwordHash: await bcrypt.hash(motDePasse, 12),
    mustChangePassword: true,
  }),
});
if (!r.ok) {
  console.error(`❌ ${r.status} ${(await r.text()).slice(0, 200)}`);
  process.exit(1);
}

/* Vérification de bout en bout : on relit le condensé RÉELLEMENT stocké et
   on lui repose le mot de passe. Sans cela, on transmet une valeur qu'on
   n'a jamais vue fonctionner — et l'échec se découvre chez la personne. */
const [apres] = await r.json();
const ok = await bcrypt.compare(motDePasse, apres.passwordHash);

console.log(`\n${compte.name}`);
console.log(`  identifiant  : ${EMAIL}`);
console.log(`  mot de passe : ${motDePasse}   (provisoire — changement imposé)`);
console.log(`  vérification : ${ok ? "✅ le condensé stocké accepte ce mot de passe" : "❌ INCOHÉRENT"}`);
if (!ok) process.exit(1);
