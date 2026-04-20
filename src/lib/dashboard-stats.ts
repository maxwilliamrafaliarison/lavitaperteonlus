import type { Material, MaterialType, Site, Room } from "@/types";
import { MATERIAL_TYPE_LABELS } from "@/types";
import { scoreObsolescence, type ObsolescenceLevel } from "./obsolescence";

/* ============================================================
   AGRÉGATIONS POUR DASHBOARD DIRECTION
   Entrée : liste Material[], sortie : stats prêtes à afficher
   ============================================================ */

// --- Prix moyens de remplacement (EUR) par type, si purchasePrice absent ---
// Ajusté pour le marché malgache (import + livraison). Modifiable par la direction.
export const AVG_REPLACEMENT_PRICE: Record<MaterialType, number> = {
  ordinateur_fixe: 800,
  ordinateur_portable: 900,
  ordinateur_bdd: 1200,
  imprimante: 300,
  scanner: 200,
  routeur: 80,
  switch: 120,
  box: 60,
  telephone: 120,
  serveur: 2000,
  ecran: 200,
  peripherique: 40,
  autre: 150,
};

export interface LevelDistribution {
  ok: number;
  warning: number;
  critical: number;
  total: number;
}

export function distributionByLevel(materials: Material[]): LevelDistribution {
  const dist: LevelDistribution = { ok: 0, warning: 0, critical: 0, total: materials.length };
  for (const m of materials) {
    const { level } = scoreObsolescence(m);
    dist[level]++;
  }
  return dist;
}

// --- Répartition par site (nb total + nb critiques) ---
export interface SiteStats {
  siteId: string;
  siteName: string;
  siteCode: string;
  total: number;
  ok: number;
  warning: number;
  critical: number;
  avgScore: number;
}

export function statsBySite(materials: Material[], sites: Site[]): SiteStats[] {
  return sites.map((site) => {
    const items = materials.filter((m) => m.siteId === site.id);
    const scored = items.map((m) => scoreObsolescence(m));
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)
        : 0;
    return {
      siteId: site.id,
      siteName: site.name,
      siteCode: site.code,
      total: items.length,
      ok: scored.filter((s) => s.level === "ok").length,
      warning: scored.filter((s) => s.level === "warning").length,
      critical: scored.filter((s) => s.level === "critical").length,
      avgScore,
    };
  });
}

// --- Répartition par type de matériel ---
export interface TypeStats {
  type: MaterialType;
  label: string;
  total: number;
  critical: number;
  avgScore: number;
}

export function statsByType(materials: Material[], lang: "fr" | "it" = "fr"): TypeStats[] {
  const groups = new Map<MaterialType, Material[]>();
  for (const m of materials) {
    const arr = groups.get(m.type) ?? [];
    arr.push(m);
    groups.set(m.type, arr);
  }
  return [...groups.entries()]
    .map(([type, items]) => {
      const scored = items.map((m) => scoreObsolescence(m));
      return {
        type,
        label: MATERIAL_TYPE_LABELS[type][lang],
        total: items.length,
        critical: scored.filter((s) => s.level === "critical").length,
        avgScore:
          scored.length > 0
            ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)
            : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// --- Histogramme par année d'achat ---
export interface AgeBucket {
  year: number;
  count: number;
}

export function ageHistogram(materials: Material[]): AgeBucket[] {
  const buckets = new Map<number, number>();
  const currentYear = new Date().getFullYear();

  for (const m of materials) {
    if (!m.purchaseDate) continue;
    const d = new Date(m.purchaseDate);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    if (y < 2000 || y > currentYear) continue;
    buckets.set(y, (buckets.get(y) ?? 0) + 1);
  }

  // Remplir les années manquantes entre min et max pour un histogramme continu
  const years = [...buckets.keys()];
  if (years.length === 0) return [];
  const minY = Math.min(...years);
  const maxY = Math.max(...years, currentYear);
  const result: AgeBucket[] = [];
  for (let y = minY; y <= maxY; y++) {
    result.push({ year: y, count: buckets.get(y) ?? 0 });
  }
  return result;
}

// --- Heatmap par salle (salles les plus obsolètes en premier) ---
export interface RoomStats {
  roomId: string;
  roomName: string;
  roomCode: string;
  siteId: string;
  siteCode: string;
  total: number;
  avgScore: number;
  critical: number;
}

export function statsByRoom(
  materials: Material[],
  rooms: Room[],
  sites: Site[],
): RoomStats[] {
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  return rooms
    .map((room) => {
      const items = materials.filter((m) => m.roomId === room.id);
      const scored = items.map((m) => scoreObsolescence(m));
      const avgScore =
        scored.length > 0
          ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)
          : 100;
      return {
        roomId: room.id,
        roomName: room.name,
        roomCode: room.code,
        siteId: room.siteId,
        siteCode: siteMap.get(room.siteId)?.code ?? "",
        total: items.length,
        avgScore,
        critical: scored.filter((s) => s.level === "critical").length,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => a.avgScore - b.avgScore);
}

// --- Budget estimé de renouvellement ---
export interface BudgetEstimate {
  totalCritical: number;
  totalEstimated: number;
  avgPerItem: number;
  byType: { type: MaterialType; label: string; count: number; cost: number }[];
}

export function estimateReplacementBudget(
  materials: Material[],
  lang: "fr" | "it" = "fr",
  priceOverrides: Partial<Record<MaterialType, number>> = {},
): BudgetEstimate {
  const criticals = materials.filter(
    (m) => scoreObsolescence(m).level === "critical",
  );

  const priceOf = (m: Material): number => {
    // Priorité : prix d'achat réel → override → fallback moyen
    if (m.purchasePrice && m.purchasePrice > 0) return m.purchasePrice;
    return priceOverrides[m.type] ?? AVG_REPLACEMENT_PRICE[m.type];
  };

  const byType = new Map<MaterialType, { count: number; cost: number }>();
  let total = 0;
  for (const m of criticals) {
    const p = priceOf(m);
    total += p;
    const entry = byType.get(m.type) ?? { count: 0, cost: 0 };
    entry.count++;
    entry.cost += p;
    byType.set(m.type, entry);
  }

  return {
    totalCritical: criticals.length,
    totalEstimated: Math.round(total),
    avgPerItem: criticals.length > 0 ? Math.round(total / criticals.length) : 0,
    byType: [...byType.entries()]
      .map(([type, v]) => ({
        type,
        label: MATERIAL_TYPE_LABELS[type][lang],
        count: v.count,
        cost: Math.round(v.cost),
      }))
      .sort((a, b) => b.cost - a.cost),
  };
}

// --- Tokens de couleur pour charts (cohérent avec globals.css) ---
export const LEVEL_CHART_COLOR: Record<ObsolescenceLevel, string> = {
  ok: "oklch(0.75 0.18 150)",
  warning: "oklch(0.82 0.16 85)",
  critical: "oklch(0.64 0.24 27)",
};
