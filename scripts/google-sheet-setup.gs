/**
 * ============================================================
 * LA VITA PER TE — Setup du Google Sheet
 * ============================================================
 * Ce script crée la structure complète des 10 onglets utilisés
 * par le tableau de bord (sites, rooms, materials, sessions,
 * movements, users, audit_log, trash, network, config) avec
 * les en-têtes, le formatage, le figeage de la 1ère ligne et
 * les données de seed (sites REX/MIARAKA, salles connues).
 *
 * UTILISATION :
 * 1. Ouvrez votre Google Sheet
 * 2. Menu : Extensions > Apps Script
 * 3. Collez tout ce fichier dans l'éditeur (remplace le contenu)
 * 4. Cliquez sur Enregistrer (icône disquette)
 * 5. Sélectionnez la fonction `setupSheet` dans la liste déroulante
 * 6. Cliquez sur ▶ Exécuter
 * 7. Autorisez l'accès quand Google le demande
 * 8. Le script va créer tous les onglets et insérer les seeds
 *
 * Pour réinitialiser tout (DANGER, supprime les données) :
 *   exécutez `resetSheet()` à la place.
 *
 * Pour seulement seeder les sites/salles (sans toucher aux autres onglets) :
 *   exécutez `seedSitesAndRooms()`
 * ============================================================
 */

// --- Définition de la structure des 10 onglets ---------------
const SCHEMAS = {
  config: {
    headers: ["key", "value", "description"],
    color: "#6b7280",
    seed: [
      ["app_name", "La Vita Per Te Dashboard", "Nom affiché dans l'app"],
      ["default_lang", "fr", "Langue par défaut (fr|it)"],
      ["organization", "ONG-ODV Alfeo Corassori", "Nom de l'organisation"],
      ["wifi_orange_b428", "LaViePourTous", "MDP Wifi Orange-B428 (à chiffrer)"],
      ["wifi_orange_obe5", "cd8vtnRP6GgUIp", "MDP Wifi Orange-OBE5 (à chiffrer)"],
    ],
  },
  users: {
    headers: [
      "id", "email", "passwordHash", "name", "role",
      "lang", "active", "createdAt", "lastLoginAt", "invitedBy",
    ],
    color: "#dc2626",
    seed: [
      // Compte admin initial — le mot de passe sera défini en Phase 2
      ["u_admin_001", "informatique.lavitaperte@gmail.com", "TO_SET_IN_PHASE_2",
       "Max William RAFALIARISON", "admin", "fr", "TRUE", new Date().toISOString(), "", "system"],
    ],
  },
  sites: {
    headers: ["id", "code", "name", "city", "address", "active"],
    color: "#0891b2",
    seed: [
      ["site_rex", "REX", "Centre REX", "Fianarantsoa",
       "Centre de prévention et de santé pour la femme et l'enfant", "TRUE"],
      ["site_miaraka", "MIARAKA", "Centre MIARAKA", "Fianarantsoa",
       "Ambatolahikosoa", "TRUE"],
    ],
  },
  rooms: {
    headers: ["id", "siteId", "code", "name", "floor", "service", "ipRange"],
    color: "#0891b2",
    seed: [
      // Centre REX
      ["room_rex_00", "site_rex", "00", "Accueil", "RDC", "Accueil", "192.168.8.x"],
      ["room_rex_01", "site_rex", "01", "Mammographie", "RDC", "Médical / Imagerie", ""],
      ["room_rex_02", "site_rex", "02", "Salle de réunion", "RDC", "Administration", ""],
      ["room_rex_03", "site_rex", "03", "Direction", "RDC", "Direction", "192.168.8.200"],
      ["room_rex_04", "site_rex", "04", "Bureau Claudia / Felana", "RDC", "Mission / Évènements", ""],
      ["room_rex_05", "site_rex", "05", "Échographie / Logistique", "RDC", "Médical / Logistique", "192.168.8.x"],
      ["room_rex_06", "site_rex", "06", "Bureau Dr Alice", "RDC", "Médical", "192.168.8.7"],
      ["room_rex_07", "site_rex", "07", "Comptabilité / Administration", "RDC", "Administration / RAF", ""],
      ["room_rex_08", "site_rex", "08", "Pédiatrie", "RDC", "Médical", "192.168.8.13"],
      ["room_rex_09", "site_rex", "09", "Laboratoire", "RDC", "BDD / Labo", "192.168.8.4"],
      ["room_rex_10", "site_rex", "10", "Échographie", "RDC", "Médical / Pharmacie", "192.168.8.12"],
      ["room_rex_11", "site_rex", "11", "Salle 11", "", "", ""],
      ["room_rex_12", "site_rex", "12", "Salle 12", "", "", ""],
      ["room_rex_labgal", "site_rex", "labgal", "Laboratoire galénique", "", "Médical", ""],
      // Centre MIARAKA
      ["room_miaraka_garcons", "site_miaraka", "G", "Centre Miaraka Garçons", "", "Éducation", ""],
    ],
  },
  materials: {
    headers: [
      "id", "ref", "type", "designation", "brand", "model", "serialNumber",
      "siteId", "roomId", "service", "owner", "assignedTo",
      "purchaseDate", "purchasePrice", "amortization",
      "os", "cpu", "ram", "storage",
      "ipAddress", "macAddress", "internetAccess", "linkedToBDD",
      "state", "notes", "photos",
      "quantity2023", "quantity2024", "quantity2025",
      "createdAt", "updatedAt", "deletedAt",
    ],
    color: "#dc2626",
    seed: [],
  },
  sessions: {
    headers: [
      "id", "materialId", "sessionName", "encryptedPassword",
      "passwordIv", "passwordTag", "assignedUser", "isAdmin",
      "notes", "createdAt", "updatedAt",
    ],
    color: "#7c3aed",
    seed: [],
  },
  movements: {
    headers: [
      "id", "materialId", "type",
      "fromSiteId", "fromRoomId", "fromAssignedTo",
      "toSiteId", "toRoomId", "toAssignedTo",
      "byUserId", "reason", "date",
    ],
    color: "#0891b2",
    seed: [],
  },
  trash: {
    headers: [
      "id", "originalSheet", "originalId", "snapshot",
      "deletedBy", "deletedAt", "reason",
    ],
    color: "#6b7280",
    seed: [],
  },
  audit_log: {
    headers: [
      "id", "userId", "userEmail", "action",
      "targetType", "targetId", "details",
      "ip", "userAgent", "timestamp",
    ],
    color: "#f59e0b",
    seed: [],
  },
  network: {
    headers: [
      "id", "siteId", "roomId", "type", "name",
      "encryptedPassword", "passwordIv", "passwordTag",
      "ipAddress", "notes",
    ],
    color: "#0891b2",
    seed: [
      ["net_001", "site_rex", "room_rex_03", "wifi", "Orange-OBE5", "TO_ENCRYPT", "", "", "192.168.8.1", "Box principale"],
      ["net_002", "site_rex", "room_rex_05", "box", "Orange-B428 (Flybox B681)", "TO_ENCRYPT", "", "", "192.168.1.1", "Box secondaire"],
      ["net_003", "site_rex", "room_rex_05", "switch", "TP-LINK 24 ports", "", "", "", "", ""],
      ["net_004", "site_rex", "room_rex_09", "switch", "TP-LINK 8 ports", "", "", "", "", ""],
    ],
  },
};

// --- Helpers --------------------------------------------------
function _getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function _formatHeader(sheet, headers, color) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight("bold");
  range.setFontColor("#ffffff");
  range.setBackground(color);
  range.setHorizontalAlignment("left");
  range.setVerticalAlignment("middle");
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
}

function _seedSheet(sheet, headers, rows) {
  if (!rows || rows.length === 0) return;
  // Vérifier si déjà des données (au-delà du header)
  if (sheet.getLastRow() > 1) {
    Logger.log("Onglet " + sheet.getName() + " contient déjà des données, seed sauté.");
    return;
  }
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

// --- FONCTION PRINCIPALE -------------------------------------
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("Configuration de : " + ss.getName());

  Object.entries(SCHEMAS).forEach(([sheetName, def]) => {
    const sheet = _getOrCreateSheet(sheetName);
    _formatHeader(sheet, def.headers, def.color);
    _seedSheet(sheet, def.headers, def.seed);
    Logger.log("✓ " + sheetName + " (" + def.headers.length + " colonnes, " + def.seed.length + " seed)");
  });

  // Supprimer la feuille par défaut "Feuille 1" / "Sheet1" si elle est vide
  ["Feuille 1", "Sheet1", "Externes"].forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      Logger.log("✗ Supprimé : " + name);
    }
  });

  // Réordonner les onglets
  const order = ["config", "users", "sites", "rooms", "materials",
                 "sessions", "movements", "trash", "audit_log", "network"];
  order.forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (sh) ss.setActiveSheet(sh) && ss.moveActiveSheet(i + 1);
  });

  // Activer le 1er onglet
  ss.setActiveSheet(ss.getSheetByName("config"));

  SpreadsheetApp.getUi().alert(
    "✅ Setup terminé",
    "Les 10 onglets ont été créés avec leurs en-têtes et seeds.\n\n" +
    "Sites : 2 (REX + MIARAKA)\n" +
    "Salles : 15 pré-remplies\n" +
    "Réseau : 4 entrées de base\n\n" +
    "Vous pouvez maintenant continuer la configuration GCP.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// --- Seed uniquement sites + rooms ---------------------------
function seedSitesAndRooms() {
  ["sites", "rooms"].forEach((name) => {
    const def = SCHEMAS[name];
    const sheet = _getOrCreateSheet(name);
    _formatHeader(sheet, def.headers, def.color);
    sheet.getRange(2, 1, sheet.getLastRow(), def.headers.length).clearContent();
    _seedSheet(sheet, def.headers, def.seed);
  });
  SpreadsheetApp.getUi().alert("Seeds sites + rooms réinjectés.");
}

// --- Reset complet (DANGER) ----------------------------------
function resetSheet() {
  const response = SpreadsheetApp.getUi().alert(
    "⚠ Réinitialisation",
    "Cela va SUPPRIMER tous les onglets gérés par l'app et leurs données. Continuer ?",
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (response !== SpreadsheetApp.getUi().Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMAS).forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh) ss.deleteSheet(sh);
  });
  ss.insertSheet("__placeholder__");
  setupSheet();
  const placeholder = ss.getSheetByName("__placeholder__");
  if (placeholder) ss.deleteSheet(placeholder);
}
