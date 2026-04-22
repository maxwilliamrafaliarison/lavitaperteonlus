import { z } from "zod";

/* ============================================================
   LA VITA PER TE — Modèles de données
   Source de vérité : Google Sheets (10 onglets)
   ============================================================ */

// --- Rôles / permissions -----------------------------------------------------
export const UserRole = z.enum([
  "admin",
  "informaticien",
  "direction",
  "logistique",
]);
export type UserRole = z.infer<typeof UserRole>;

export const ROLE_LABELS: Record<UserRole, { fr: string; it: string }> = {
  admin: { fr: "Administrateur", it: "Amministratore" },
  informaticien: { fr: "Informaticien", it: "Informatico" },
  direction: { fr: "Direction", it: "Direzione" },
  logistique: { fr: "Responsable logistique", it: "Responsabile logistica" },
};

// --- Utilisateurs de l'application ------------------------------------------
export const AppUser = z.object({
  id: z.string(),
  email: z.string().email(),
  passwordHash: z.string(),
  name: z.string(),
  role: UserRole,
  lang: z.enum(["fr", "it"]).default("fr"),
  active: z.boolean().default(true),
  createdAt: z.string(),
  lastLoginAt: z.string().optional(),
  invitedBy: z.string().optional(),
});
export type AppUser = z.infer<typeof AppUser>;

export type SafeUser = Omit<AppUser, "passwordHash">;

// --- Sites (Centres) --------------------------------------------------------
export const Site = z.object({
  id: z.string(),
  code: z.string(), // ex: REX, MIARAKA
  name: z.string(),
  city: z.string(),
  address: z.string().optional(),
  active: z.boolean().default(true),
});
export type Site = z.infer<typeof Site>;

// --- Salles ----------------------------------------------------------------
export const Room = z.object({
  id: z.string(),
  siteId: z.string(),
  code: z.string(), // ex: "03", "porte-5"
  name: z.string(), // ex: "Direction", "Logistique"
  floor: z.string().optional(),
  service: z.string().optional(), // ex: "Médical", "Administration"
  ipRange: z.string().optional(),
});
export type Room = z.infer<typeof Room>;

// --- Types de matériel -----------------------------------------------------
export const MaterialType = z.enum([
  "ordinateur_fixe",
  "ordinateur_portable",
  "ordinateur_bdd",
  "imprimante",
  "scanner",
  "routeur",
  "switch",
  "box",
  "telephone",
  "serveur",
  "ecran",
  "onduleur",
  "peripherique",
  "autre",
]);
export type MaterialType = z.infer<typeof MaterialType>;

export const MATERIAL_TYPE_LABELS: Record<MaterialType, { fr: string; it: string }> = {
  ordinateur_fixe: { fr: "Ordinateur fixe", it: "Computer fisso" },
  ordinateur_portable: { fr: "Ordinateur portable", it: "Computer portatile" },
  ordinateur_bdd: { fr: "Ordinateur BDD", it: "Computer database" },
  imprimante: { fr: "Imprimante", it: "Stampante" },
  scanner: { fr: "Scanner", it: "Scanner" },
  routeur: { fr: "Routeur", it: "Router" },
  switch: { fr: "Switch", it: "Switch" },
  box: { fr: "Box internet", it: "Box internet" },
  telephone: { fr: "Téléphone", it: "Telefono" },
  serveur: { fr: "Serveur", it: "Server" },
  ecran: { fr: "Écran", it: "Schermo" },
  onduleur: { fr: "Onduleur", it: "Gruppo di continuità" },
  peripherique: { fr: "Périphérique", it: "Periferica" },
  autre: { fr: "Autre", it: "Altro" },
};

// --- État matériel ---------------------------------------------------------
export const MaterialState = z.enum([
  "operationnel",
  "en_panne",
  "obsolete",
  "en_reparation",
  "hors_service",
]);
export type MaterialState = z.infer<typeof MaterialState>;

// --- Matériel (parc info) --------------------------------------------------
export const Material = z.object({
  id: z.string(),
  ref: z.string(),                                    // REX-INFO-043A-2020
  type: MaterialType,
  designation: z.string(),                            // "ROUTEUR Wifi"
  brand: z.string().optional(),                       // "TP-LINK"
  model: z.string().optional(),                       // "Dell OptiPlex 780"
  serialNumber: z.string().optional(),
  siteId: z.string(),
  roomId: z.string(),
  service: z.string().optional(),
  owner: z.string().optional(),                       // "alfeo corassori"
  assignedTo: z.string().optional(),                  // utilisateur principal
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  amortization: z.string().optional(),
  biosDate: z.string().optional(),                    // Date du BIOS/firmware — plus fidèle à l'âge réel du hardware que purchaseDate (utile pour les dons, achats d'occasion)
  // Specs (pour obsolescence)
  os: z.string().optional(),                          // Windows 7 Pro
  cpu: z.string().optional(),
  ram: z.string().optional(),
  storage: z.string().optional(),
  // Réseau
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  internetAccess: z.boolean().optional(),
  linkedToBDD: z.boolean().optional(),
  // État
  state: MaterialState.default("operationnel"),
  notes: z.string().optional(),
  photos: z.array(z.string()).default([]),            // URLs / Drive IDs
  // Meta
  quantity2023: z.number().optional(),
  quantity2024: z.number().optional(),
  quantity2025: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),                   // soft delete → corbeille
});
export type Material = z.infer<typeof Material>;

// --- Sessions (comptes sur ordinateurs) ------------------------------------
export const MaterialSession = z.object({
  id: z.string(),
  materialId: z.string(),
  sessionName: z.string(),                            // "Administrator", "Accueil", "Mission"
  encryptedPassword: z.string(),                      // AES-256-GCM
  passwordIv: z.string(),                             // IV du chiffrement
  passwordTag: z.string(),                            // authentification tag
  assignedUser: z.string().optional(),                // "Perline", "Felana"
  isAdmin: z.boolean().default(false),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MaterialSession = z.infer<typeof MaterialSession>;

// --- Mouvements (transferts) -----------------------------------------------
export const MovementType = z.enum([
  "creation",
  "transfert_salle",
  "transfert_utilisateur",
  "transfert_site",
  "reparation",
  "mise_au_rebut",
  "restauration",
]);
export type MovementType = z.infer<typeof MovementType>;

export const Movement = z.object({
  id: z.string(),
  materialId: z.string(),
  type: MovementType,
  fromSiteId: z.string().optional(),
  fromRoomId: z.string().optional(),
  fromAssignedTo: z.string().optional(),
  toSiteId: z.string().optional(),
  toRoomId: z.string().optional(),
  toAssignedTo: z.string().optional(),
  byUserId: z.string(),
  reason: z.string().optional(),
  date: z.string(),
});
export type Movement = z.infer<typeof Movement>;

// --- Audit log (consultation MDP) ------------------------------------------
export const AuditLogAction = z.enum([
  "view_password",
  "view_material",
  "edit_material",
  "delete_material",
  "restore_material",
  "transfer_material",
  "invite_user",
  "login",
  "logout",
]);
export type AuditLogAction = z.infer<typeof AuditLogAction>;

export const AuditLog = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  action: AuditLogAction,
  targetType: z.string(),              // "material", "session", "user"
  targetId: z.string(),
  details: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string(),
});
export type AuditLog = z.infer<typeof AuditLog>;

// --- Infos réseau (WiFi, Box, etc) -----------------------------------------
export const NetworkInfo = z.object({
  id: z.string(),
  siteId: z.string(),
  roomId: z.string().optional(),
  type: z.enum(["wifi", "box", "switch", "ethernet"]),
  name: z.string(),                    // "Orange-OBE5"
  encryptedPassword: z.string().optional(),
  passwordIv: z.string().optional(),
  passwordTag: z.string().optional(),
  ipAddress: z.string().optional(),
  notes: z.string().optional(),
});
export type NetworkInfo = z.infer<typeof NetworkInfo>;
