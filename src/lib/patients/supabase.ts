/* ============================================================
   PATIENTS — Accès Supabase (schéma patients) via PostgREST
   Données de santé RGPD art. 9 → base Postgres UE (eu-west-1),
   RLS actif, seul le serveur (service_role) lit/écrit.
   fetch direct : pas de dépendance SDK, cohérent avec le reste
   de l'app (client Sheets pharmacie).
   ============================================================ */

function env() {
  const url = process.env.PATIENTS_SUPABASE_URL;
  const key = process.env.PATIENTS_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Patients non configuré : PATIENTS_SUPABASE_URL / PATIENTS_SUPABASE_SERVICE_KEY manquants.",
    );
  }
  return { url, key };
}

type QueryOpts = {
  select?: string;
  /** Filtres PostgREST bruts, ex. { n_patiente: "eq.1497" } */
  filters?: Record<string, string>;
  order?: string;
  limit?: number;
  offset?: number;
};

async function pgrest<T>(
  table: string,
  opts: QueryOpts = {},
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ rows: T[]; total: number }> {
  const { url, key } = env();
  const params = new URLSearchParams();
  if (opts.select) params.set("select", opts.select);
  if (opts.order) params.set("order", opts.order);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  for (const [k, v] of Object.entries(opts.filters ?? {})) params.set(k, v);

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": "patients",
    "Content-Profile": "patients",
  };
  if (method === "GET") headers.Prefer = "count=exact";
  if (body) headers["Content-Type"] = "application/json";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`PostgREST ${res.status} : ${(await res.text()).slice(0, 160)}`);
    }
    const rows = (await res.json()) as T[];
    // Content-Range: 0-24/1234  → total après le slash
    const cr = res.headers.get("content-range");
    const total = cr && cr.includes("/") ? Number(cr.split("/")[1]) : rows.length;
    return { rows, total: Number.isFinite(total) ? total : rows.length };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------
// Types (sous-ensemble utile des 146 colonnes)
// ------------------------------------------------------------------

export interface DossierRow {
  id: number;
  n_patiente: string | null;
  nom_prenom: string | null;
  date_de_naissance: string | null;
  adresse: string | null;
  tel: string | null;
  csb: string | null;
  date: string | null;
  pap: string | null;
  hpv: string | null;
  mamo: string | null;
  colposcopies: string | null;
  echographies: string | null;
  resultat: string | null;
  resultat_histologique: string | null;
  renseignements_cliniques: string | null;
  commentaires: string | null;
  nom_du_medecin: string | null;
  grossesses: string | null;
  parites: string | null;
  contraception: string | null;
  menopause: string | null;
  [key: string]: unknown;
}

export interface PatientResume {
  n_patiente: string;
  nom_prenom: string;
  date_de_naissance: string;
  nb_visites: number;
  derniere_visite: string;
}

const RESUME_SELECT =
  "n_patiente,nom_prenom,date_de_naissance,date";

// ------------------------------------------------------------------
// Recherche de patientes
// ------------------------------------------------------------------

/**
 * Recherche par nom ou numéro de patiente. Regroupe les visites par
 * n_patiente pour renvoyer des PATIENTES distinctes (pas des lignes).
 * La recherche porte sur un échantillon large trié par récence.
 */
export async function rechercherPatientes(
  q: string,
  limit = 40,
): Promise<PatientResume[]> {
  const terme = q.trim();
  if (terme.length < 2) return [];

  const filters: Record<string, string> = {};
  if (/^\d+$/.test(terme)) {
    // Numérique : match n_patiente (avec ou sans préfixe P)
    filters.or = `(n_patiente.ilike.*${terme}*,nom_prenom.ilike.*${terme}*)`;
  } else {
    filters.nom_prenom = `ilike.*${terme.replace(/\s+/g, "*")}*`;
  }

  const { rows } = await pgrest<DossierRow>("dossiers", {
    select: RESUME_SELECT,
    filters,
    order: "date.desc",
    limit: 400,
  });

  // Regroupe par n_patiente
  const parPatiente = new Map<string, PatientResume>();
  for (const r of rows) {
    const num = (r.n_patiente ?? "").trim();
    if (!num) continue;
    const existing = parPatiente.get(num);
    if (existing) {
      existing.nb_visites += 1;
      if ((r.date ?? "") > existing.derniere_visite) {
        existing.derniere_visite = r.date ?? "";
      }
      if (!existing.nom_prenom && r.nom_prenom) existing.nom_prenom = r.nom_prenom;
    } else {
      parPatiente.set(num, {
        n_patiente: num,
        nom_prenom: (r.nom_prenom ?? "").trim(),
        date_de_naissance: (r.date_de_naissance ?? "").trim(),
        nb_visites: 1,
        derniere_visite: r.date ?? "",
      });
    }
  }
  return [...parPatiente.values()].slice(0, limit);
}

/** Toutes les visites (dossiers) d'une patiente, plus récentes d'abord. */
export async function visitesDeLaPatiente(
  nPatiente: string,
): Promise<DossierRow[]> {
  const { rows } = await pgrest<DossierRow>("dossiers", {
    select: "*",
    filters: { n_patiente: `eq.${nPatiente}` },
    order: "date.desc",
    limit: 500,
  });
  return rows;
}

/** Un dossier (visite) précis par son id. */
export async function dossierParId(id: number): Promise<DossierRow | null> {
  const { rows } = await pgrest<DossierRow>("dossiers", {
    select: "*",
    filters: { id: `eq.${id}` },
    limit: 1,
  });
  return rows[0] ?? null;
}

// ------------------------------------------------------------------
// Statistiques globales (dashboard patients)
// ------------------------------------------------------------------

export interface PatientsStats {
  totalVisites: number;
  totalCaisse: number;
  totalLettres: number;
}

export async function statsPatients(): Promise<PatientsStats> {
  const [d, c, l] = await Promise.all([
    pgrest<{ id: number }>("dossiers", { select: "id", limit: 1 }),
    pgrest<{ id: number }>("caisse", { select: "id", limit: 1 }),
    pgrest<{ id: number }>("lettres", { select: "id", limit: 1 }),
  ]);
  return {
    totalVisites: d.total,
    totalCaisse: c.total,
    totalLettres: l.total,
  };
}

// ------------------------------------------------------------------
// Journal d'accès (RGPD art. 32) — qui consulte quoi
// ------------------------------------------------------------------

export async function logAccesPatient(entry: {
  userEmail: string;
  action: string;
  dossierId?: number;
  details?: string;
}): Promise<void> {
  try {
    await pgrest(
      "acces_log",
      {},
      "POST",
      [
        {
          user_email: entry.userEmail,
          action: entry.action,
          dossier_id: entry.dossierId ?? null,
          details: entry.details ?? null,
        },
      ],
    );
  } catch {
    // Le journal ne doit jamais bloquer la consultation ; on avale
    // l'erreur (elle sera visible dans les logs serveur si fetch échoue).
  }
}
