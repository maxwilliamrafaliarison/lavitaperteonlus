import { NextResponse } from "next/server";
import { readSheet, SHEETS } from "@/lib/sheets/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("health");

export const dynamic = "force-dynamic";

/**
 * Endpoint de santé — utile pour monitoring externe (UptimeRobot, etc.)
 * et pour diagnostiquer en prod les problèmes d'env vars Google Sheets.
 *
 * Retourne toujours 200 avec un JSON détaillé. Les appels ne demandent
 * PAS d'auth — mais aucune donnée sensible n'est exposée (seulement
 * des booléens et compteurs).
 *
 * Exemple : curl https://lavitaperteonlus.vercel.app/api/health
 */
export async function GET() {
  const start = Date.now();
  const result: {
    ok: boolean;
    timestamp: string;
    node: string;
    env: { sheetId: boolean; serviceAccount: boolean; privateKey: boolean; authSecret: boolean; encryptionSecret: boolean; pharmacieSheetId: boolean; patientsUrl: boolean; patientsKey: boolean };
    sheets: { reachable: boolean; userCount?: number; error?: string };
    patients?: { reachable: boolean; error?: string };
    latencyMs?: number;
  } = {
    ok: true,
    timestamp: new Date().toISOString(),
    node: process.version,
    env: {
      sheetId: Boolean(process.env.GOOGLE_SHEET_ID),
      serviceAccount: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      privateKey: Boolean(process.env.GOOGLE_PRIVATE_KEY),
      authSecret: Boolean(process.env.AUTH_SECRET),
      encryptionSecret: Boolean(process.env.ENCRYPTION_SECRET),
      // Apps optionnelles pour le statut ok, reportées pour diagnostic
      pharmacieSheetId: Boolean(process.env.PHARMACIE_SHEET_ID),
      patientsUrl: Boolean(process.env.PATIENTS_SUPABASE_URL),
      patientsKey: Boolean(process.env.PATIENTS_SUPABASE_SERVICE_KEY),
    },
    sheets: { reachable: false },
  };

  // Teste la connexion au Sheet
  try {
    const rows = await readSheet<{ id: string }>(SHEETS.users);
    result.sheets.reachable = true;
    // Ne pas exposer le nombre d'utilisateurs en production (reconnaissance)
    // — visible uniquement en dev pour debug local.
    if (process.env.NODE_ENV !== "production") {
      result.sheets.userCount = rows.length;
    }
  } catch (e) {
    result.ok = false;
    result.sheets.error = e instanceof Error ? e.message : String(e);
    log.error("health check sheets failure", e instanceof Error ? e : undefined);
  }

  // Teste la connexion Patients (Supabase) si configurée — sanitize la
  // clé comme le fait le client, pour détecter un caractère parasite.
  if (result.env.patientsUrl && result.env.patientsKey) {
    try {
      const url = (process.env.PATIENTS_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
      const key = (process.env.PATIENTS_SUPABASE_SERVICE_KEY ?? "").replace(/[^A-Za-z0-9._-]/g, "");
      const res = await fetch(`${url}/rest/v1/dossiers?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "patients" },
      });
      result.patients = res.ok
        ? { reachable: true }
        : { reachable: false, error: `HTTP ${res.status}` };
    } catch (e) {
      result.patients = { reachable: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // L'health est dégradé si une env var du cœur manque
  // (pharmacie/patients sont diagnostiques : apps optionnelles)
  const { pharmacieSheetId: _p, patientsUrl: _pu, patientsKey: _pk, ...coreEnv } = result.env;
  if (Object.values(coreEnv).some((v) => !v)) {
    result.ok = false;
  }

  result.latencyMs = Date.now() - start;

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
