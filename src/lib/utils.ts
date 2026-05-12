import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Titres honorifiques (préservés dans le nom d'usage).
// Match insensible à la casse + ponctuation finale optionnelle.
const HONORIFIC_RE =
  /^(dr|dott|dott\.ssa|m|mr|mrs|ms|mme|mlle|pr|prof|sig|sig\.ra|don|donna|fr|sr|père|soeur)\.?$/i

/**
 * Extrait le nom d'usage pour la salutation :
 *   - "Max William RAFALIARISON"  → "Max"
 *   - "Eugenio POLIUTI"           → "Eugenio"
 *   - "Dr Elisa SALA"             → "Dr Elisa"   (titre conservé)
 *
 * Règle : si le premier token est un titre honorifique, on garde
 * titre + premier prénom suivant ; sinon on retourne juste le premier prénom.
 */
export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ""
  const tokens = fullName.trim().split(/\s+/)
  if (tokens.length === 0) return ""
  if (HONORIFIC_RE.test(tokens[0])) {
    const next = tokens.slice(1).find((t) => !HONORIFIC_RE.test(t))
    return next ? `${tokens[0]} ${next}` : tokens[0]
  }
  return tokens[0]
}
