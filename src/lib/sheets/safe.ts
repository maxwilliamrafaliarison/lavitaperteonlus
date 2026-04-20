/* ============================================================
   Helpers de lecture défensive du Google Sheet
   - Si les env vars ne sont pas configurées (Phase 1.B pas faite)
   - Si l'API renvoie une erreur réseau / quota / permission
   → On retourne un fallback explicite plutôt que crasher l'UI
   ============================================================ */

export interface SafeResult<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export async function safe<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<SafeResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sheets:safe]", msg);
    return { ok: false, data: fallback, error: msg };
  }
}

export function isConfigError(error?: string): boolean {
  if (!error) return false;
  return /not configured|GOOGLE_SHEET_ID|GOOGLE_SERVICE_ACCOUNT_EMAIL|GOOGLE_PRIVATE_KEY/i.test(
    error,
  );
}
