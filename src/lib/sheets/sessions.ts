import { appendRow, readSheet, SHEETS, updateRowById, deleteRowById } from "./client";
import { encrypt, decrypt } from "@/lib/crypto/aes";
import type { MaterialSession } from "@/types";

/* ============================================================
   COUCHE D'ACCÈS — onglet `sessions` du Google Sheet
   Headers (cf. setupSheet) :
   id | materialId | sessionName | encryptedPassword |
   passwordIv | passwordTag | assignedUser | isAdmin |
   notes | createdAt | updatedAt
   ============================================================
   ⚠️ Les mots de passe sont stockés CHIFFRÉS en AES-256-GCM.
   La clé de chiffrement vit dans ENCRYPTION_SECRET.
   Le déchiffrement n'est jamais automatique : il faut appeler
   `revealSessionPassword(id)` qui fait l'audit log.
*/

type RawRow = Record<string, unknown>;

function rowToSession(r: RawRow): MaterialSession | null {
  if (!r.id || !r.materialId) return null;
  const isAdmin = String(r.isAdmin ?? "FALSE").toUpperCase() === "TRUE";
  return {
    id: String(r.id),
    materialId: String(r.materialId),
    sessionName: String(r.sessionName ?? ""),
    encryptedPassword: String(r.encryptedPassword ?? ""),
    passwordIv: String(r.passwordIv ?? ""),
    passwordTag: String(r.passwordTag ?? ""),
    assignedUser: r.assignedUser ? String(r.assignedUser) : undefined,
    isAdmin,
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: String(r.createdAt ?? ""),
    updatedAt: String(r.updatedAt ?? ""),
  };
}

function sessionToRow(s: MaterialSession): unknown[] {
  return [
    s.id,
    s.materialId,
    s.sessionName,
    s.encryptedPassword,
    s.passwordIv,
    s.passwordTag,
    s.assignedUser ?? "",
    s.isAdmin ? "TRUE" : "FALSE",
    s.notes ?? "",
    s.createdAt,
    s.updatedAt,
  ];
}

function genId(prefix = "ses"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Lecture --------------------------------------------------
export async function listSessions(opts?: { materialId?: string }): Promise<MaterialSession[]> {
  const rows = await readSheet<RawRow>(SHEETS.sessions);
  let sessions = rows.map(rowToSession).filter((s): s is MaterialSession => s !== null);
  if (opts?.materialId) {
    sessions = sessions.filter((s) => s.materialId === opts.materialId);
  }
  return sessions;
}

export async function getSession(id: string): Promise<MaterialSession | null> {
  const sessions = await listSessions();
  return sessions.find((s) => s.id === id) ?? null;
}

// --- Écriture (chiffre AES) ----------------------------------
export interface CreateSessionInput {
  materialId: string;
  sessionName: string;
  plainPassword: string;
  assignedUser?: string;
  isAdmin?: boolean;
  notes?: string;
}

export async function createSession(input: CreateSessionInput): Promise<MaterialSession> {
  const enc = encrypt(input.plainPassword);
  const now = new Date().toISOString();
  const session: MaterialSession = {
    id: genId(),
    materialId: input.materialId,
    sessionName: input.sessionName,
    encryptedPassword: enc.encrypted,
    passwordIv: enc.iv,
    passwordTag: enc.tag,
    assignedUser: input.assignedUser,
    isAdmin: input.isAdmin ?? false,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(SHEETS.sessions, sessionToRow(session));
  return session;
}

export interface UpdateSessionInput {
  sessionName?: string;
  /** Si fourni, le MDP sera re-chiffré. */
  plainPassword?: string;
  assignedUser?: string;
  isAdmin?: boolean;
  notes?: string;
}

export async function updateSession(id: string, input: UpdateSessionInput): Promise<MaterialSession> {
  const current = await getSession(id);
  if (!current) throw new Error(`Session ${id} introuvable`);

  let { encryptedPassword, passwordIv, passwordTag } = current;
  if (input.plainPassword) {
    const enc = encrypt(input.plainPassword);
    encryptedPassword = enc.encrypted;
    passwordIv = enc.iv;
    passwordTag = enc.tag;
  }

  const merged: MaterialSession = {
    ...current,
    sessionName: input.sessionName ?? current.sessionName,
    encryptedPassword,
    passwordIv,
    passwordTag,
    assignedUser: input.assignedUser !== undefined ? input.assignedUser : current.assignedUser,
    isAdmin: input.isAdmin !== undefined ? input.isAdmin : current.isAdmin,
    notes: input.notes !== undefined ? input.notes : current.notes,
    updatedAt: new Date().toISOString(),
  };
  await updateRowById(SHEETS.sessions, id, sessionToRow(merged));
  return merged;
}

export async function deleteSession(id: string): Promise<void> {
  // Retire réellement la ligne. L'implémentation précédente écrivait onze
  // chaînes vides par-dessus, laissant une LIGNE FANTÔME à l'id vide :
  // elle faussait la résolution des lignes suivantes et un identifiant vide
  // y aurait résolu. Le commentaire qui justifiait ce contournement
  // (« l'API ne supporte pas deleteRow ») était périmé : deleteRow existe
  // dans client.ts. Et c'était intraduisible en Supabase — deux suppressions
  // auraient violé la clé primaire sur l'id vide.
  await deleteRowById(SHEETS.sessions, id);
}

// --- Déchiffrement contrôlé ----------------------------------
/**
 * Déchiffre le MDP d'une session. NE PAS appeler directement depuis
 * un composant — utiliser le server action `revealSessionPasswordAction`
 * qui vérifie les permissions et écrit l'audit log.
 */
export function decryptSessionPassword(session: MaterialSession): string {
  return decrypt({
    encrypted: session.encryptedPassword,
    iv: session.passwordIv,
    tag: session.passwordTag,
  });
}
