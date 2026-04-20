import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || hash === "TO_SET_IN_PHASE_2") return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Vérifie qu'un mot de passe respecte les règles minimales :
 * - 8 caractères minimum
 * - au moins 1 chiffre
 * - au moins 1 lettre
 */
export function validatePassword(plain: string): { ok: boolean; error?: string } {
  if (plain.length < 8) return { ok: false, error: "8 caractères minimum requis." };
  if (!/[a-zA-Z]/.test(plain)) return { ok: false, error: "Au moins 1 lettre requise." };
  if (!/[0-9]/.test(plain)) return { ok: false, error: "Au moins 1 chiffre requis." };
  return { ok: true };
}
