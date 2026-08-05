#!/usr/bin/env node
/**
 * PRÉPARATION DE LA LIVRAISON — régénère les mots de passe des comptes
 * remis aux utilisatrices et à la direction, et imprime le récapitulatif.
 *
 * Un hachage bcrypt ne se relit pas : pour transmettre un mot de passe, il
 * faut en poser un nouveau. C'est la contrepartie normale d'un stockage sûr.
 *
 * Deux qualités de mot de passe, selon ce que le compte ouvre :
 *   • comptes à privilèges (direction) — tirage cryptographique, long ;
 *   • comptes de comptoir — un nom de médicament et quelques chiffres, à la
 *     demande du responsable : ces postes saisissent leur mot de passe
 *     plusieurs fois par jour, devant des clients, et un mot de passe
 *     impossible à retenir finit sur un papier collé à l'écran.
 * Dans les deux cas le changement est imposé à la première connexion : la
 * valeur transmise par message ne doit pas rester le mot de passe définitif.
 *
 * Usage : npx tsx scripts/preparer-livraison.mts --apply
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

/** Alphabet sans caractères ambigus : le mot de passe sera recopié à la main. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const fort = (n = 16) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
/** Mot de passe de comptoir : un médicament connu, une majuscule, 3 chiffres. */
const MEDICAMENTS = ["Amoxicilline", "Paracetamol", "Ibuprofene", "Metronidazole", "Cotrimoxazole", "Albendazole"];
const comptoir = () => `${MEDICAMENTS[randomInt(MEDICAMENTS.length)]}${randomInt(100, 1000)}`;

const COMPTES: Array<{ email: string; type: "fort" | "comptoir" }> = [
  { email: "direction.lavitaperte@gmail.com", type: "fort" },
  { email: "lida.lavitaperte@gmail.com", type: "comptoir" },
  { email: "fanilo.lavitaperte@gmail.com", type: "comptoir" },
];

const resultats: Array<{ nom: string; email: string; role: string; motDePasse: string }> = [];

for (const c of COMPTES) {
  const motDePasse = c.type === "fort" ? fort() : comptoir();
  const lu = await fetch(`${U}/rest/v1/users?select=name,role&email=eq.${c.email}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "logistique" },
  });
  const [u] = await lu.json();
  if (!u) {
    console.error(`⚠️  Compte introuvable : ${c.email}`);
    continue;
  }

  if (APPLY) {
    const r = await fetch(`${U}/rest/v1/users?email=eq.${c.email}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        passwordHash: await bcrypt.hash(motDePasse, 12),
        active: true,
        mustChangePassword: true,
      }),
    });
    if (!r.ok) {
      console.error(`❌ ${c.email} → ${r.status} ${(await r.text()).slice(0, 160)}`);
      continue;
    }
  }
  resultats.push({ nom: u.name, email: c.email, role: u.role, motDePasse });
}

console.log(APPLY ? "✅ Mots de passe régénérés\n" : "(simulation — relancez avec --apply)\n");
for (const r of resultats) {
  console.log(`${r.nom}`);
  console.log(`  identifiant  : ${r.email}`);
  console.log(`  mot de passe : ${r.motDePasse}`);
  console.log(`  rôle         : ${r.role}\n`);
}
