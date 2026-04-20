import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { AppTopbar } from "@/components/layout/app-topbar";
import { TransferForm } from "@/components/materials/transfer-form";
import { getMaterial } from "@/lib/sheets/materials";
import { listSites, listRooms, getSite, getRoom } from "@/lib/sheets/sites";
import { safe } from "@/lib/sheets/safe";
import type { Material, Site, Room } from "@/types";

export const dynamic = "force-dynamic";

export default async function MaterialTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "movement:create")) {
    redirect(`/materials/${id}`);
  }

  const matRes = await safe<Material | null>(() => getMaterial(id), null);
  const material = matRes.data;
  if (!material) notFound();

  const [sitesRes, roomsRes, currentSiteRes, currentRoomRes] = await Promise.all([
    safe<Site[]>(() => listSites({ activeOnly: true }), []),
    safe<Room[]>(() => listRooms(), []),
    safe<Site | null>(() => getSite(material.siteId), null),
    safe<Room | null>(() => getRoom(material.roomId), null),
  ]);

  return (
    <>
      <AppTopbar title="Transfert" />
      <main className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full">
        <TransferForm
          material={material}
          sites={sitesRes.data}
          rooms={roomsRes.data}
          currentSite={currentSiteRes.data}
          currentRoom={currentRoomRes.data}
        />
      </main>
    </>
  );
}
