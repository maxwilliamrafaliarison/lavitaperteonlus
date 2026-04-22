import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listMovements } from "@/lib/sheets/movements";
import { listUsers } from "@/lib/sheets/users";
import { scoreObsolescence } from "@/lib/obsolescence";
import type { Material, Site, Room, Movement, AppUser } from "@/types";
import type { ReportFilters } from "./types";

/** Applique les filtres communs (site/salle/type/état) à une liste de matériels. */
function applyCommonFilters(materials: Material[], f: ReportFilters): Material[] {
  return materials.filter((m) => {
    if (f.siteId && m.siteId !== f.siteId) return false;
    if (f.roomId && m.roomId !== f.roomId) return false;
    if (f.materialType && m.type !== f.materialType) return false;
    if (f.state && m.state !== f.state) return false;
    return true;
  });
}

export interface InventaireData {
  materials: Material[];
  sites: Site[];
  rooms: Room[];
  // Groupés : par site → par salle → matériels triés par ref
  grouped: Array<{
    site: Site;
    rooms: Array<{ room: Room; materials: Material[] }>;
  }>;
  totalCount: number;
  shownCount: number;
}

export async function fetchInventaire(
  filters: ReportFilters,
): Promise<InventaireData> {
  const [allMaterials, sites, rooms] = await Promise.all([
    listMaterials(),
    listSites(),
    listRooms(),
  ]);

  const materials = applyCommonFilters(allMaterials, filters);

  // Regrouper par site puis par salle
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const bySiteRoom = new Map<string, Map<string, Material[]>>();
  for (const m of materials) {
    if (!bySiteRoom.has(m.siteId)) bySiteRoom.set(m.siteId, new Map());
    const byRoom = bySiteRoom.get(m.siteId)!;
    if (!byRoom.has(m.roomId)) byRoom.set(m.roomId, []);
    byRoom.get(m.roomId)!.push(m);
  }

  const grouped = [...bySiteRoom.entries()]
    .map(([siteId, byRoom]) => {
      const site = siteMap.get(siteId);
      if (!site) return null;
      const roomsList = [...byRoom.entries()]
        .map(([roomId, mats]) => {
          const room = roomMap.get(roomId);
          if (!room) return null;
          return {
            room,
            materials: mats.sort((a, b) => a.ref.localeCompare(b.ref)),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.room.code.localeCompare(b.room.code));
      return { site, rooms: roomsList };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.site.code.localeCompare(b.site.code));

  return {
    materials,
    sites,
    rooms,
    grouped,
    totalCount: allMaterials.length,
    shownCount: materials.length,
  };
}

export interface ARemplacerData {
  materials: Array<{
    material: Material;
    score: number;
    reasons: string[];
    site?: Site;
    room?: Room;
  }>;
  totalCount: number;
  sites: Site[];
  rooms: Room[];
  threshold: number;
}

export async function fetchARemplacer(
  filters: ReportFilters,
): Promise<ARemplacerData> {
  const [allMaterials, sites, rooms] = await Promise.all([
    listMaterials(),
    listSites(),
    listRooms(),
  ]);

  const materials = applyCommonFilters(allMaterials, filters);
  const threshold = filters.maxScore ?? 40;
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const scored = materials
    .map((m) => {
      const { score, reasons } = scoreObsolescence(m);
      return {
        material: m,
        score,
        reasons,
        site: siteMap.get(m.siteId),
        room: roomMap.get(m.roomId),
      };
    })
    .filter((x) => x.score <= threshold)
    .sort((a, b) => a.score - b.score);

  return {
    materials: scored,
    totalCount: allMaterials.length,
    sites,
    rooms,
    threshold,
  };
}

export interface ValorisationData {
  materials: Material[];
  sites: Site[];
  totalPurchasePrice: number;
  byType: Array<{
    type: string;
    count: number;
    totalPrice: number;
  }>;
  bySite: Array<{
    site: Site;
    count: number;
    totalPrice: number;
    critical: number;
    criticalCost: number;
  }>;
  renewalBudget: {
    criticalCount: number;
    estimatedCost: number;
  };
}

const AVG_REPLACEMENT_PRICE: Record<string, number> = {
  ordinateur_fixe: 4_000_000,
  ordinateur_portable: 4_500_000,
  ordinateur_bdd: 6_000_000,
  imprimante: 1_500_000,
  scanner: 1_000_000,
  routeur: 400_000,
  switch: 600_000,
  box: 300_000,
  telephone: 600_000,
  serveur: 10_000_000,
  ecran: 1_000_000,
  onduleur: 900_000,
  peripherique: 200_000,
  autre: 750_000,
};

export async function fetchValorisation(
  filters: ReportFilters,
): Promise<ValorisationData> {
  const [allMaterials, sites] = await Promise.all([
    listMaterials(),
    listSites(),
  ]);

  const materials = applyCommonFilters(allMaterials, filters);
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  let totalPurchasePrice = 0;
  const byTypeMap = new Map<string, { count: number; totalPrice: number }>();
  const bySiteMap = new Map<
    string,
    { count: number; totalPrice: number; critical: number; criticalCost: number }
  >();

  let criticalCount = 0;
  let estimatedCost = 0;

  for (const m of materials) {
    const price = m.purchasePrice ?? 0;
    totalPurchasePrice += price;

    const tEntry = byTypeMap.get(m.type) ?? { count: 0, totalPrice: 0 };
    tEntry.count++;
    tEntry.totalPrice += price;
    byTypeMap.set(m.type, tEntry);

    const sEntry = bySiteMap.get(m.siteId) ?? {
      count: 0,
      totalPrice: 0,
      critical: 0,
      criticalCost: 0,
    };
    sEntry.count++;
    sEntry.totalPrice += price;

    const { level } = scoreObsolescence(m);
    if (level === "critical") {
      const cost = m.purchasePrice && m.purchasePrice > 0
        ? m.purchasePrice
        : (AVG_REPLACEMENT_PRICE[m.type] ?? 750_000);
      criticalCount++;
      estimatedCost += cost;
      sEntry.critical++;
      sEntry.criticalCost += cost;
    }
    bySiteMap.set(m.siteId, sEntry);
  }

  const byType = [...byTypeMap.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.totalPrice - a.totalPrice);

  const bySite = [...bySiteMap.entries()]
    .map(([siteId, v]) => ({
      site: siteMap.get(siteId)!,
      ...v,
    }))
    .filter((x) => x.site)
    .sort((a, b) => b.totalPrice - a.totalPrice);

  return {
    materials,
    sites,
    totalPurchasePrice,
    byType,
    bySite,
    renewalBudget: { criticalCount, estimatedCost },
  };
}

export interface MouvementsData {
  movements: Movement[];
  sites: Site[];
  rooms: Room[];
  materials: Material[];
  users: AppUser[];
  countByType: Record<string, number>;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchMouvements(
  filters: ReportFilters,
): Promise<MouvementsData> {
  const [movements, sites, rooms, materials, users] = await Promise.all([
    listMovements(),
    listSites(),
    listRooms(),
    listMaterials({ includeDeleted: true }),
    listUsers(),
  ]);

  let filtered = movements;
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    filtered = filtered.filter((m) => new Date(m.date).getTime() >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime() + 86400 * 1000; // fin de journée
    filtered = filtered.filter((m) => new Date(m.date).getTime() < to);
  }
  if (filters.movementType) {
    filtered = filtered.filter((m) => m.type === filters.movementType);
  }

  const countByType: Record<string, number> = {};
  for (const m of filtered) {
    countByType[m.type] = (countByType[m.type] || 0) + 1;
  }

  return {
    movements: filtered,
    sites,
    rooms,
    materials,
    users,
    countByType,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}

export interface ParUtilisateurData {
  groups: Array<{
    key: string; // nom de la personne ou du service
    materials: Material[];
    totalValue: number;
  }>;
  sites: Site[];
  rooms: Room[];
  totalCount: number;
}

export async function fetchParUtilisateur(
  filters: ReportFilters,
): Promise<ParUtilisateurData> {
  const [allMaterials, sites, rooms] = await Promise.all([
    listMaterials(),
    listSites(),
    listRooms(),
  ]);

  let materials = applyCommonFilters(allMaterials, filters);
  if (filters.assignedTo) {
    const q = filters.assignedTo.toLowerCase();
    materials = materials.filter((m) =>
      (m.assignedTo ?? "").toLowerCase().includes(q),
    );
  }
  if (filters.service) {
    const q = filters.service.toLowerCase();
    materials = materials.filter((m) =>
      (m.service ?? "").toLowerCase().includes(q),
    );
  }

  // Si service spécifique : grouper par service ; sinon par assignedTo
  const groupByService = !!filters.service;
  const groups = new Map<string, Material[]>();

  for (const m of materials) {
    const key = groupByService
      ? (m.service || "(sans service)")
      : (m.assignedTo || "(non affecté)");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const result = [...groups.entries()]
    .map(([key, mats]) => ({
      key,
      materials: mats.sort((a, b) => a.ref.localeCompare(b.ref)),
      totalValue: mats.reduce((s, m) => s + (m.purchasePrice ?? 0), 0),
    }))
    .sort((a, b) => b.materials.length - a.materials.length);

  return { groups: result, sites, rooms, totalCount: materials.length };
}

export interface ParSalleData {
  site: Site | null;
  room: Room | null;
  materials: Material[];
  totalValue: number;
  byType: Record<string, number>;
  byState: Record<string, number>;
}

export async function fetchParSalle(
  filters: ReportFilters,
): Promise<ParSalleData> {
  if (!filters.roomId) {
    return {
      site: null,
      room: null,
      materials: [],
      totalValue: 0,
      byType: {},
      byState: {},
    };
  }

  const [allMaterials, sites, rooms] = await Promise.all([
    listMaterials({ roomId: filters.roomId }),
    listSites(),
    listRooms(),
  ]);

  const room = rooms.find((r) => r.id === filters.roomId) ?? null;
  const site = room ? sites.find((s) => s.id === room.siteId) ?? null : null;

  const materials = allMaterials.sort((a, b) => a.ref.localeCompare(b.ref));

  const byType: Record<string, number> = {};
  const byState: Record<string, number> = {};
  let totalValue = 0;

  for (const m of materials) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    byState[m.state] = (byState[m.state] || 0) + 1;
    totalValue += m.purchasePrice ?? 0;
  }

  return { site, room, materials, totalValue, byType, byState };
}
