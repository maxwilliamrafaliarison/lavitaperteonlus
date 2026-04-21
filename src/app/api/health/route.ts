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
    env: { sheetId: boolean; serviceAccount: boolean; privateKey: boolean; authSecret: boolean; encryptionSecret: boolean };
    sheets: { reachable: boolean; userCount?: number; error?: string };
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

  // L'health est dégradé si une env var manque
  if (Object.values(result.env).some((v) => !v)) {
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
