import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || hash === "TO_SET_IN_PHASE_2") return false;
  return bcrypt.compare(plain, hash);
}

export type PasswordValidationCode = "too_short" | "no_letter" | "no_digit";

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; code: PasswordValidationCode; error: string };

/**
 * Vérifie qu'un mot de passe respecte les règles minimales :
 * - 8 caractères minimum
 * - au moins 1 lettre
 * - au moins 1 chiffre
 *
 * Retourne un code stable + un message FR de fallback (pour appels
 * non internationalisés). Les callers i18n-aware doivent traduire
 * `code` via t(`password_validation.${code}`).
 */
export function validatePassword(plain: string): PasswordValidationResult {
  if (plain.length < 8) {
    return { ok: false, code: "too_short", error: "8 caractères minimum requis." };
  }
  if (!/[a-zA-Z]/.test(plain)) {
    return { ok: false, code: "no_letter", error: "Au moins 1 lettre requise." };
  }
  if (!/[0-9]/.test(plain)) {
    return { ok: false, code: "no_digit", error: "Au moins 1 chiffre requis." };
  }
  return { ok: true };
}
