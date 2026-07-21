#!/usr/bin/env node
/**
 * Crée le compte du RESPONSABLE DES VENTES de la pharmacie
 * (laboratoire.lavitaperte@gmail.com), rôle « pharmacien » (vente + stock,
 * pas la configuration admin), et l'ajoute aux destinataires du rapport
 * quotidien. Écrit dans le magasin d'auth ACTIF (Supabase logistique.users).
 * Idempotent : ne recrée pas un email déjà présent.
 *
 * Usage : node --env-file=.env.local scripts/creer-responsable-ventes.mjs --apply
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { surSupabase, sbLire, sbInserer } from "./lib/backend-logistique.mjs";

const APPLY = process.argv.includes("--apply");
const EMAIL = "laboratoire.lavitaperte@gmail.com";
const NAME = "Responsable ventes — Pharmacie";
const ROLE = "pharmacien";

const URL = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");

function genPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.randomBytes(14);
  const base = Array.from(b.slice(0, 12)).map((x) => alphabet[x % alphabet.length]).join("");
  return base + "!@#$%&*"[b[12] % 7] + "23456789"[b[13] % 8];
}

if (!surSupabase("users")) { console.error("❌ users n'est pas servi par Supabase — abandon"); process.exit(1); }

const existants = await sbLire("users?select=email");
if (existants.some((u) => String(u.email).toLowerCase() === EMAIL)) {
  console.log(`= ${EMAIL} existe déjà — aucun compte créé.`);
  process.exit(0);
}

const password = genPassword();
const hash = await bcrypt.hash(password, 12);
const id = `usr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

if (!APPLY) {
  console.log("(simulation) créerait :", { id, email: EMAIL, name: NAME, role: ROLE });
  console.log("Relancez avec --apply.");
  process.exit(0);
}

await sbInserer("users", [{
  id, email: EMAIL, passwordHash: hash, name: NAME, role: ROLE, lang: "fr",
  active: true, createdAt: new Date().toISOString(), lastLoginAt: "", invitedBy: "u_admin_001",
}]);

// Ajouter aux destinataires du rapport quotidien (RPC pharmacie.set_parametre).
const HP = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
const params = await fetch(`${URL}/rest/v1/parametres?select=cle,valeur&cle=eq.email_rapports_destinataires`, { headers: HP }).then((r) => r.json());
const actuels = (params[0]?.valeur ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
if (!actuels.map((e) => e.toLowerCase()).includes(EMAIL)) {
  const nouveau = [...actuels, EMAIL].join(", ");
  await fetch(`${URL}/rest/v1/rpc/set_parametre`, { method: "POST", headers: HP, body: JSON.stringify({ p_cle: "email_rapports_destinataires", p_valeur: nouveau }) });
  console.log("✅ Ajouté aux destinataires du rapport quotidien.");
} else {
  console.log("= déjà destinataire du rapport quotidien.");
}

const sep = "=".repeat(64);
console.log("\n" + sep);
console.log("✅ COMPTE CRÉÉ — identifiants à transmettre (une seule fois)");
console.log(sep);
console.log(`  URL          : https://lavitaperteonlus.vercel.app/login`);
console.log(`  Email        : ${EMAIL}`);
console.log(`  Mot de passe : ${password}`);
console.log(`  Rôle         : ${ROLE} (vente + stock)`);
console.log(`  Nom affiché  : ${NAME}`);
console.log(sep);
console.log("⚠️  Mot de passe affiché UNE SEULE FOIS. À copier maintenant et à");
console.log("    transmettre au responsable, qui pourra le changer dans Réglages.");
