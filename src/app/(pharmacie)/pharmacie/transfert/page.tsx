import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock, listStockParLot } from "@/lib/pharmacie/sheets";
import { estFractionnable, facteur } from "@/lib/pharmacie/fractionnement";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { ProduitAvecStock, StockLot } from "@/lib/pharmacie/types";

import { TransfertForm, type ProduitTransfert } from "./transfert-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transfert réserve / rayon" };

export default async function TransfertPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pharmacie:stock")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const [prodRes, stockRes] = await Promise.all([
    safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []),
    safe<Map<string, StockLot[]>>(() => listStockParLot(), new Map()),
  ]);

  // Seuls les produits vendus à l'unité ont des boîtes à ouvrir. On ne garde
  // que ceux qui ont au moins un lot avec du stock (réserve ou rayon).
  const produits: ProduitTransfert[] = prodRes.data
    .filter((p) => p.statut === "actif" && estFractionnable(p))
    .map((p) => ({
      id: p.id,
      designation: p.designation,
      uniteDetail: p.unite_detail,
      facteur: facteur(p),
      lots: (stockRes.data.get(p.id) ?? []).filter((l) => l.gros > 0 || l.detail > 0),
    }))
    .filter((p) => p.lots.length > 0);

  return (
    <main id="main-content" className="mx-auto max-w-7xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pharmacie.transfert_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          {t("pharmacie.transfert_subtitle")}
        </p>
      </div>

      <TransfertForm produits={produits} lang={lang} />
    </main>
  );
}
