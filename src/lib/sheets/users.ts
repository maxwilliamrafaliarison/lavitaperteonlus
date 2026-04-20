import { appendRow, readSheet, SHEETS, updateRow, getSheetsClient, getSpreadsheetId } from "./client";
import { AppUser, UserRole } from "@/types";

/* ============================================================
   COUCHE D'ACCÈS — onglet `users` du Google Sheet
   Headers (cf. setupSheet) :
   id | email | passwordHash | name | role | lang | active |
   createdAt | lastLoginAt | invitedBy
   ============================================================ */

export type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  lang: "fr" | "it";
  active: string | boolean;       // Sheets renvoie parfois "TRUE"/"FALSE"
  createdAt: string;
  lastLoginAt: string;
  invitedBy: string;
};

const HEADERS = [
  "id", "email", "passwordHash", "name", "role",
  "lang", "active", "createdAt", "lastLoginAt", "invitedBy",
] as const;

function rowToUser(row: UserRow): AppUser | null {
  if (!row.id || !row.email) return null;
  const active = typeof row.active === "string"
    ? row.active.toUpperCase() === "TRUE"
    : Boolean(row.active);
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash ?? "",
    name: row.name ?? "",
    role: (row.role as UserRole) ?? "logistique",
    lang: (row.lang as "fr" | "it") ?? "fr",
    active,
    createdAt: String(row.createdAt ?? ""),
    lastLoginAt: row.lastLoginAt ? String(row.lastLoginAt) : undefined,
    invitedBy: row.invitedBy || undefined,
  };
}

function userToRow(user: AppUser): unknown[] {
  return [
    user.id,
    user.email,
    user.passwordHash,
    user.name,
    user.role,
    user.lang,
    user.active ? "TRUE" : "FALSE",
    user.createdAt,
    user.lastLoginAt ?? "",
    user.invitedBy ?? "",
  ];
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await readSheet<UserRow>(SHEETS.users);
  return rows.map(rowToUser).filter((u): u is AppUser => u !== null);
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const lower = email.trim().toLowerCase();
  const users = await listUsers();
  return users.find((u) => u.email.toLowerCase() === lower) ?? null;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const users = await listUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function createUser(user: AppUser): Promise<AppUser> {
  await appendRow(SHEETS.users, userToRow(user));
  return user;
}

/**
 * Met à jour les champs d'un utilisateur. Effectue une lecture pour
 * trouver l'index de la ligne, puis updateRow.
 */
export async function updateUser(id: string, patch: Partial<AppUser>): Promise<AppUser> {
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.users}!A:A`,
  });
  const ids = (res.data.values ?? []).flat() as string[];
  const idx = ids.indexOf(id);
  if (idx <= 0) throw new Error(`Utilisateur ${id} introuvable`);
  const rowIndex = idx + 1; // 1-based; ligne 1 = headers, donc l'utilisateur est à idx+1

  const users = await listUsers();
  const current = users.find((u) => u.id === id);
  if (!current) throw new Error(`Utilisateur ${id} introuvable (re-fetch)`);
  const merged: AppUser = { ...current, ...patch };
  await updateRow(SHEETS.users, rowIndex, userToRow(merged));
  return merged;
}

/** Indique si un setup initial est nécessaire (au moins un user a un MDP non défini). */
export async function needsInitialSetup(): Promise<boolean> {
  const users = await listUsers();
  if (users.length === 0) return true;
  return users.some((u) => !u.passwordHash || u.passwordHash === "TO_SET_IN_PHASE_2");
}
