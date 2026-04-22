#!/usr/bin/env node
/**
 * Ajoute 2 administrateurs au Sheet (Eugenio IT + Onésime FR) avec
 * mots de passe générés aléatoirement. Imprime les credentials en console
 * + templates d'emails prêts à envoyer.
 *
 * Usage (one-shot) : node scripts/invite-admins.mjs
 */

import { config } from "dotenv";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { google } from "googleapis";

config({ path: ".env.local" });

// --- Génère un MDP fort, lisible, ni confusant (pas de 0/O/l/1) ---
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  // 12 chars + 1 symbole + 1 chiffre forcés
  const bytes = crypto.randomBytes(14);
  const base = Array.from(bytes.slice(0, 12))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  const symbol = "!@#$%&*"[bytes[12] % 7];
  const digit = "23456789"[bytes[13] % 8];
  return base + symbol + digit;
}

const NEW_USERS = [
  {
    name: "Sylvano Onésime RAKOTONDRAVELO",
    email: "jimrakotondravelo@gmail.com",
    role: "admin",
    lang: "fr",
  },
  {
    name: "Eugenio POLIUTI",
    email: "eugepol96@gmail.com",
    role: "admin",
    lang: "it",
  },
  {
    name: "Ettore DUSCI",
    email: "ettoredusci21@gmail.com",
    role: "admin",
    lang: "it",
  },
  {
    name: "William Andriamifidy RANDRIANASOLO",
    email: "logistique.lavitaperte@gmail.com",
    role: "logistique",
    lang: "fr",
  },
];

function genUserId() {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// 1. Lit les emails existants pour éviter les doublons
console.log("📂 Vérification des utilisateurs existants...");
const existing = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: "users!B:B",
});
const existingEmails = new Set(
  (existing.data.values ?? [])
    .flat()
    .filter(Boolean)
    .map((e) => String(e).toLowerCase()),
);

const toCreate = [];
const skipped = [];
for (const u of NEW_USERS) {
  if (existingEmails.has(u.email.toLowerCase())) {
    skipped.push(u);
  } else {
    toCreate.push(u);
  }
}

if (skipped.length > 0) {
  console.log("\n⏭️  Déjà présents (ignorés) :");
  skipped.forEach((u) => console.log(`   - ${u.email}`));
}

if (toCreate.length === 0) {
  console.log("\n✅ Tous les utilisateurs existent déjà.");
  process.exit(0);
}

// 2. Génère les credentials + hashes
console.log("\n🔐 Génération des mots de passe...");
const createdUsers = [];
for (const u of toCreate) {
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 12);
  createdUsers.push({ ...u, password, hash });
}

// 3. Build rows pour le Sheet
const now = new Date().toISOString();
const rows = createdUsers.map((u) => [
  genUserId(),             // id
  u.email,                 // email
  u.hash,                  // passwordHash
  u.name,                  // name
  u.role,                  // role
  u.lang,                  // lang
  "TRUE",                  // active
  now,                     // createdAt
  "",                      // lastLoginAt
  "u_admin_001",           // invitedBy (Max)
]);

console.log("\n📤 Écriture dans le Sheet...");
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: "users!A1",
  valueInputOption: "USER_ENTERED",
  requestBody: { values: rows },
});
console.log(`✅ ${rows.length} utilisateur(s) ajouté(s).`);

// 4. Output credentials + templates emails
console.log("\n" + "=".repeat(72));
console.log("🔑 CREDENTIALS (à communiquer aux intéressés)");
console.log("=".repeat(72));
for (const u of createdUsers) {
  console.log(`\n👤 ${u.name}`);
  console.log(`   Email  : ${u.email}`);
  console.log(`   MDP    : ${u.password}`);
  console.log(`   Rôle   : ${u.role} · Langue : ${u.lang}`);
}

console.log("\n" + "=".repeat(72));
console.log("📧 EMAILS PRÊTS À ENVOYER");
console.log("=".repeat(72));

for (const u of createdUsers) {
  const loginUrl = "https://lavitaperteonlus.vercel.app/login";
  console.log("\n" + "-".repeat(72));
  console.log(`À : ${u.email}`);

  const ROLE_FR = {
    admin: {
      label: "administrateur",
      perms: `  • l'inventaire complet du parc (222 matériels)
  • les mots de passe chiffrés des postes
  • le journal d'audit
  • la gestion des utilisateurs et la corbeille`,
    },
    informaticien: {
      label: "informaticien",
      perms: `  • l'inventaire complet du parc (222 matériels)
  • les mots de passe chiffrés des postes
  • créer / modifier / supprimer des matériels
  • enregistrer les transferts entre salles`,
    },
    direction: {
      label: "membre de la direction",
      perms: `  • l'inventaire complet du parc (lecture seule)
  • les mots de passe chiffrés des postes
  • le dashboard avec les indicateurs décisionnels`,
    },
    logistique: {
      label: "responsable logistique",
      perms: `  • l'inventaire complet du parc (222 matériels)
  • ajouter / modifier / supprimer des matériels
  • déplacer un matériel d'une salle à une autre (transferts)
  • l'historique des mouvements`,
    },
  };
  const ROLE_IT = {
    admin: {
      label: "amministratore",
      perms: `  • l'inventario completo del parco (222 dispositivi)
  • le password cifrate delle postazioni
  • il registro di audit
  • la gestione degli utenti e il cestino`,
    },
    informaticien: {
      label: "informatico",
      perms: `  • l'inventario completo del parco (222 dispositivi)
  • le password cifrate delle postazioni
  • creare / modificare / eliminare dispositivi
  • registrare i trasferimenti tra sale`,
    },
    direction: {
      label: "membro della direzione",
      perms: `  • l'inventario completo (sola lettura)
  • le password cifrate delle postazioni
  • la dashboard con gli indicatori decisionali`,
    },
    logistique: {
      label: "responsabile logistica",
      perms: `  • l'inventario completo del parco (222 dispositivi)
  • aggiungere / modificare / eliminare dispositivi
  • spostare un dispositivo da una sala a un'altra (trasferimenti)
  • lo storico dei movimenti`,
    },
  };

  if (u.lang === "fr") {
    const role = ROLE_FR[u.role] ?? ROLE_FR.admin;
    console.log(`Objet : Votre accès au tableau de bord La Vita Per Te\n`);
    console.log(`Bonjour ${u.name.split(" ")[0]},

Ton compte ${role.label} sur le tableau de bord numérique du Centre REX
est prêt. Voici tes identifiants de connexion :

  URL           : ${loginUrl}
  Email         : ${u.email}
  Mot de passe  : ${u.password}

À ta première connexion, va dans « Réglages » (avatar en haut à droite
→ Mes réglages) pour choisir ton propre mot de passe.

Avec ton rôle « ${role.label} », tu peux accéder à :
${role.perms}

Merci de ne pas partager ces identifiants. À très vite sur la plateforme !

— Max`);
  } else {
    const role = ROLE_IT[u.role] ?? ROLE_IT.admin;
    console.log(`Oggetto : Il tuo accesso alla dashboard La Vita Per Te\n`);
    console.log(`Ciao ${u.name.split(" ")[0]},

Il tuo account di ${role.label} sulla dashboard del Centro REX è pronto.
Ecco le credenziali di accesso :

  URL       : ${loginUrl}
  Email     : ${u.email}
  Password  : ${u.password}

L'interfaccia è già configurata in italiano per te. Al primo accesso,
ti consiglio di andare in « Impostazioni » (avatar in alto a destra →
Le mie impostazioni) per scegliere una password a tua scelta.

Con il ruolo di ${role.label} hai accesso a :
${role.perms}

Ti chiedo di non condividere queste credenziali. A presto sulla piattaforma !

— Max`);
  }
}

console.log("\n" + "=".repeat(72));
console.log("⚠️  Ces mots de passe ne sont affichés qu'UNE SEULE FOIS.");
console.log("    Copie-les maintenant dans un gestionnaire sécurisé si besoin.");
console.log("=".repeat(72));
