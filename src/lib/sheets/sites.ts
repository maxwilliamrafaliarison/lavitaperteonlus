import { readSheet, SHEETS } from "./client";
import type { Site, Room } from "@/types";

type RawRow = Record<string, unknown>;

function rowToSite(r: RawRow): Site | null {
  if (!r.id || !r.code) return null;
  const active = String(r.active ?? "TRUE").toUpperCase() === "TRUE";
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name ?? ""),
    city: String(r.city ?? ""),
    address: r.address ? String(r.address) : undefined,
    active,
  };
}

function rowToRoom(r: RawRow): Room | null {
  if (!r.id || !r.siteId) return null;
  return {
    id: String(r.id),
    siteId: String(r.siteId),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    floor: r.floor ? String(r.floor) : undefined,
    service: r.service ? String(r.service) : undefined,
    ipRange: r.ipRange ? String(r.ipRange) : undefined,
  };
}

export async function listSites(opts?: { activeOnly?: boolean }): Promise<Site[]> {
  const rows = await readSheet<RawRow>(SHEETS.sites);
  let sites = rows.map(rowToSite).filter((s): s is Site => s !== null);
  if (opts?.activeOnly) sites = sites.filter((s) => s.active);
  return sites;
}

export async function getSite(id: string): Promise<Site | null> {
  const sites = await listSites();
  return sites.find((s) => s.id === id) ?? null;
}

export async function listRooms(opts?: { siteId?: string }): Promise<Room[]> {
  const rows = await readSheet<RawRow>(SHEETS.rooms);
  let rooms = rows.map(rowToRoom).filter((r): r is Room => r !== null);
  if (opts?.siteId) rooms = rooms.filter((r) => r.siteId === opts.siteId);
  return rooms;
}

export async function getRoom(id: string): Promise<Room | null> {
  const rooms = await listRooms();
  return rooms.find((r) => r.id === id) ?? null;
}
