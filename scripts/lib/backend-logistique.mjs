/**
 * Backend logistique pour les SCRIPTS d'administration.
 *
 * Les scripts ne peuvent pas importer src/lib/sheets/client.ts (TypeScript) :
 * ce module réplique la règle de routage — LOGISTIQUE_SUPABASE_TABS liste les
 * onglets servis par Supabase — et fournit les primitives PostgREST du schéma
 * `logistique`, pour que les scripts suivent la bascule au lieu d'écrire dans
 * un Sheet gelé que plus personne ne lit (échec silencieux, le pire genre).
 *
 * Charger .env.local AVANT d'importer ce module (config({ path: ".env.local" })).
 */

/** Onglets actuellement servis par Supabase (même règle que client.ts). */
export function ongletsSurSupabase() {
  return new Set(
    (process.env.LOGISTIQUE_SUPABASE_TABS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function surSupabase(onglet) {
  return ongletsSurSupabase().has(onglet);
}

/**
 * Garde pour les scripts qui ne parlent QUE Google Sheets : refuse de tourner
 * si l'onglet visé est servi par Supabase. Mieux vaut un arrêt bruyant qu'un
 * script qui annonce un succès invisible pour l'application.
 */
export function exigerSheets(onglet, nomScript) {
  if (surSupabase(onglet)) {
    console.error(
      `❌ L'onglet "${onglet}" est servi par Supabase (LOGISTIQUE_SUPABASE_TABS) :\n` +
        `   ${nomScript} écrit/lit Google Sheets, son résultat ne serait JAMAIS vu par l'app.\n` +
        `   → Agir sur logistique.${onglet} dans Supabase (ou retirer l'onglet du flag pour revenir à Sheets).`,
    );
    process.exit(1);
  }
}

function envSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.PATIENTS_SUPABASE_SERVICE_KEY ||
    ""
  ).replace(/[^A-Za-z0-9._-]/g, "");
  if (!url || !key) {
    console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY manquants (.env.local)");
    process.exit(1);
  }
  return { url, key };
}

function entetes(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Accept-Profile": "logistique",
    "Content-Profile": "logistique",
    ...extra,
  };
}

/** GET /rest/v1/<cheminEtQuery> — renvoie le JSON, lève sur HTTP non-2xx. */
export async function sbLire(cheminEtQuery) {
  const { url, key } = envSupabase();
  const r = await fetch(`${url}/rest/v1/${cheminEtQuery}`, { headers: entetes(key) });
  if (!r.ok) throw new Error(`GET ${cheminEtQuery} → HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

/** PATCH sur les lignes filtrées ; renvoie les lignes modifiées (Prefer: representation). */
export async function sbModifier(table, filtreQuery, patch) {
  const { url, key } = envSupabase();
  const r = await fetch(`${url}/rest/v1/${table}?${filtreQuery}`, {
    method: "PATCH",
    headers: entetes(key, { Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`PATCH ${table}?${filtreQuery} → HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

/** INSERT de lignes-objets (noms de colonnes = en-têtes du Sheet). */
export async function sbInserer(table, lignes) {
  const { url, key } = envSupabase();
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: entetes(key),
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`POST ${table} → HTTP ${r.status} ${await r.text()}`);
}
