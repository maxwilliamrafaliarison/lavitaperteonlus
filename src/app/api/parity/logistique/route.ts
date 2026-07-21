import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { readSheet, SHEETS, type SheetName } from "@/lib/sheets/client";
import { readTabSupabase } from "@/lib/sheets/supabase-backend";
import { COLUMN_ORDER, PRIMARY_KEY, NUMERIC_COLS } from "@/lib/sheets/columns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/parity/logistique?tab=materials
 *
 * Compare Google Sheets et Supabase, onglet par onglet, AVANT de basculer.
 *
 * Pourquoi pas un simple `select count(*)` : côté pharmacie, le compte en
 * base était juste — et pourtant 18 produits sur 65 disparaissaient de
 * l'application, écartés en silence à la lecture. Un compte ne prouve donc
 * rien. Ici on lit les DEUX côtés et on compare les valeurs, champ par
 * champ, dans le vrai environnement d'exécution.
 *
 * Les secrets ne sortent jamais : les mots de passe (hachés ou chiffrés)
 * sont comparés par empreinte SHA-256 tronquée, jamais transmis.
 *
 * Protégé par PARITY_SECRET ; répond 404 sans en-tête valide, pour ne pas
 * signaler son existence.
 */

/** Colonnes dont la valeur ne doit jamais quitter le serveur. */
const SECRETS = new Set(["passwordHash", "encryptedPassword", "passwordIv", "passwordTag"]);

const empreinte = (v: unknown): string =>
  crypto.createHash("sha256").update(String(v ?? "")).digest("hex").slice(0, 12);

/**
 * Normalise avant comparaison : Sheets et Postgres ne représentent pas les
 * mêmes valeurs de la même façon (booléen vs "TRUE", nombre vs texte, null
 * vs ""). On compare le SENS, pas la représentation — sinon tout diffère.
 */
function normaliser(v: unknown, estNumerique: boolean): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  const maj = s.toUpperCase();
  if (maj === "TRUE") return "true";
  if (maj === "FALSE") return "false";
  // Repli numérique RÉSERVÉ aux colonnes déclarées numériques : "1500" et
  // 1500 y sont bien la même valeur. L'appliquer aux colonnes TEXTE
  // masquerait précisément la divergence qu'on cherche ("03" vs 3 — un id
  // à zéro de tête aplati serait déclaré identique alors que l'app
  // afficherait autre chose après bascule).
  if (estNumerique) {
    const n = Number(s);
    if (s !== "" && Number.isFinite(n)) return String(n);
  }
  return s;
}

export async function GET(req: NextRequest) {
  const secret = process.env.PARITY_SECRET;
  if (!secret || req.headers.get("x-parity-secret") !== secret) {
    return new NextResponse(null, { status: 404 });
  }

  const tab = req.nextUrl.searchParams.get("tab") as SheetName | null;
  const onglets = Object.values(SHEETS) as SheetName[];
  if (!tab || !onglets.includes(tab)) {
    return NextResponse.json(
      { error: "Paramètre ?tab= requis", onglets },
      { status: 400 },
    );
  }

  try {
    const pk = PRIMARY_KEY[tab];
    const [sheetsRows, supaRows] = await Promise.all([
      // Lecture Sheets forcée : ce point de contrôle doit voir les deux
      // côtés, quel que soit l'état du flag de bascule.
      readSheet<Record<string, unknown>>(tab, `${tab}!A1:ZZ`),
      readTabSupabase<Record<string, unknown>>(tab),
    ]);

    const parSheets = new Map(sheetsRows.map((r) => [String(r[pk] ?? ""), r]));
    const parSupa = new Map(supaRows.map((r) => [String(r[pk] ?? ""), r]));

    const manquants = [...parSheets.keys()].filter((k) => k && !parSupa.has(k));
    const enTrop = [...parSupa.keys()].filter((k) => k && !parSheets.has(k));

    // Différences champ par champ, sur les lignes présentes des deux côtés.
    const divergences: Array<{ id: string; champ: string; sheets: string; supabase: string }> = [];
    for (const [id, ligneSheets] of parSheets) {
      const ligneSupa = parSupa.get(id);
      if (!id || !ligneSupa) continue;
      for (const col of COLUMN_ORDER[tab]) {
        const estNum = NUMERIC_COLS[tab]?.has(col) ?? false;
        const a = normaliser(ligneSheets[col], estNum);
        const b = normaliser(ligneSupa[col], estNum);
        if (a === b) continue;
        divergences.push({
          id,
          champ: col,
          // Les secrets sont comparés, jamais montrés.
          sheets: SECRETS.has(col) ? `sha:${empreinte(ligneSheets[col])}` : a.slice(0, 60),
          supabase: SECRETS.has(col) ? `sha:${empreinte(ligneSupa[col])}` : b.slice(0, 60),
        });
      }
    }

    const identique =
      manquants.length === 0 && enTrop.length === 0 && divergences.length === 0;

    return NextResponse.json(
      {
        onglet: tab,
        identique,
        sheets: sheetsRows.length,
        supabase: supaRows.length,
        manquantsDansSupabase: manquants.slice(0, 20),
        absentsDeSheets: enTrop.slice(0, 20),
        nbDivergences: divergences.length,
        divergences: divergences.slice(0, 40),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { onglet: tab, erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
