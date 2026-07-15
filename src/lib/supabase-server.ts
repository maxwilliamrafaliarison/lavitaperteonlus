/* ============================================================
   SUPABASE — Client serveur partagé (tous les schémas du centre)
   Base unique La Vita Per Te (eu-west-1). Accès service_role via
   PostgREST, fetch direct (pas de SDK). Un schéma par application :
   patients, pharmacie, (logistique à venir).

   Variables : SUPABASE_URL / SUPABASE_SERVICE_KEY, avec repli sur
   PATIENTS_SUPABASE_URL / PATIENTS_SUPABASE_SERVICE_KEY (déjà en place
   sur Vercel — même projet, la clé service_role vaut pour tout schéma).
   ============================================================ */

export function supabaseEnv() {
  const rawUrl =
    process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL;
  const rawKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.PATIENTS_SUPABASE_SERVICE_KEY;
  if (!rawUrl || !rawKey) {
    throw new Error(
      "Supabase non configuré : SUPABASE_URL / SUPABASE_SERVICE_KEY (ou PATIENTS_SUPABASE_*) manquants.",
    );
  }
  // Un JWT ne contient que [A-Za-z0-9._-] ; on retire tout parasite
  // (espace, retour ligne, • collé) pour éviter le crash ByteString.
  const key = rawKey.replace(/[^A-Za-z0-9._-]/g, "");
  const url = rawUrl.trim().replace(/\/+$/, "");
  return { url, key };
}

type SelectOpts = {
  select?: string;
  filters?: Record<string, string>;
  order?: string;
  limit?: number;
  offset?: number;
  count?: boolean;
};

/** Lecture PostgREST typée sur un schéma donné. */
export async function sbSelect<T>(
  schema: string,
  table: string,
  opts: SelectOpts = {},
): Promise<{ rows: T[]; total: number }> {
  const { url, key } = supabaseEnv();
  const params = new URLSearchParams();
  if (opts.select) params.set("select", opts.select);
  if (opts.order) params.set("order", opts.order);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  for (const [k, v] of Object.entries(opts.filters ?? {})) params.set(k, v);

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": schema,
  };
  if (opts.count) headers.Prefer = "count=exact";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Supabase ${schema}.${table} ${res.status} : ${(await res.text()).slice(0, 160)}`);
    }
    const rows = (await res.json()) as T[];
    const cr = res.headers.get("content-range");
    const total = cr && cr.includes("/") ? Number(cr.split("/")[1]) : rows.length;
    return { rows, total: Number.isFinite(total) ? total : rows.length };
  } finally {
    clearTimeout(timer);
  }
}

/** Insertion (POST) de lignes dans un schéma. */
export async function sbInsert(
  schema: string,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const { url, key } = supabaseEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Profile": schema,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Supabase insert ${schema}.${table} ${res.status} : ${(await res.text()).slice(0, 160)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Mise à jour ciblée (PATCH) via filtres PostgREST. */
export async function sbUpdate(
  schema: string,
  table: string,
  filters: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<number> {
  const { url, key } = supabaseEnv();
  const params = new URLSearchParams(filters);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Profile": schema,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Supabase update ${schema}.${table} ${res.status} : ${(await res.text()).slice(0, 160)}`);
    }
    const updated = (await res.json()) as unknown[];
    return updated.length;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Appelle une fonction Postgres (RPC).
 *
 * Sert là où plusieurs écritures doivent tomber ENSEMBLE : PostgREST traite
 * chaque requête isolément, donc trois appels d'affilée peuvent laisser un
 * état à moitié écrit. Une fonction plpgsql, elle, est atomique par
 * construction — c'est la seule façon d'obtenir une transaction ici.
 */
export async function sbRpc<T>(
  schema: string,
  fonction: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { url, key } = supabaseEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fonction}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Profile": schema,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Supabase rpc ${schema}.${fonction} ${res.status} : ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Suppression ciblée (DELETE) via filtres PostgREST.
 * Retourne le nombre de lignes réellement supprimées.
 *
 * ⚠️ Les filtres sont OBLIGATOIRES et non vides : sans clause `where`,
 * PostgREST viderait la table entière. On refuse plutôt que d'y arriver
 * par un objet vide passé par mégarde.
 */
export async function sbDelete(
  schema: string,
  table: string,
  filters: Record<string, string>,
): Promise<number> {
  if (Object.keys(filters).length === 0) {
    throw new Error(`sbDelete ${schema}.${table} sans filtre : refus (viderait la table)`);
  }
  const { url, key } = supabaseEnv();
  const params = new URLSearchParams(filters);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Profile": schema,
        // representation pour compter ce qui a été supprimé : un 0 permet à
        // l'appelant de distinguer « ligne absente » de « suppression faite ».
        Prefer: "return=representation",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Supabase delete ${schema}.${table} ${res.status} : ${(await res.text()).slice(0, 160)}`);
    }
    const deleted = (await res.json()) as unknown[];
    return deleted.length;
  } finally {
    clearTimeout(timer);
  }
}
