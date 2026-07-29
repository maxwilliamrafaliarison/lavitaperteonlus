import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock, listEntitesPec, listStockParLot } from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { PanneBanner } from "@/components/layout/panne-banner";
import { getT } from "@/lib/i18n";
import { aujourdhui } from "@/lib/tz";
import { estPerime } from "@/lib/pharmacie/fefo";
import type { ProduitAvecStock, EntitePec } from "@/lib/pharmacie/types";

import { VenteForm } from "./vente-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function VentePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pharmacie:vendre")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const [res, entitesRes, stockRes] = await Promise.all([
    safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []),
    safe<EntitePec[]>(() => listEntitesPec(), []),
    // Ventilation par compartiment, lots PÉRIMÉS exclus : le plafond affiché
    // au comptoir doit refléter ce que le serveur acceptera réellement de
    // servir — sinon Lida compose un panier refusé à l'encaissement, cliente
    // devant elle.
    safe(async () => {
      const jour = aujourdhui();
      const parLot = await listStockParLot();
      const out: Record<string, { gros: number; detail: number }> = {};
      for (const [produitId, lots] of parLot) {
        for (const l of lots) {
          if (estPerime(l.dateExpiration, jour)) continue;
          const acc = (out[produitId] ??= { gros: 0, detail: 0 });
          acc.gros += Math.max(0, l.gros);
          acc.detail += Math.max(0, l.detail);
        }
      }
      return out;
    }, {} as Record<string, { gros: number; detail: number }>),
  ]);

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
          {t("pharmacie.vente_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pharmacie.vente_subtitle")}
        </p>
      </div>

      {res.ok ? (
        <VenteForm produits={res.data} entites={entitesRes.data} lang={lang} stockParCompartiment={stockRes.data} />
      ) : (
        // Le catalogue est injoignable : on n'affiche PAS la caisse. Un
        // formulaire vide inviterait à composer un panier qui ne pourrait
        // pas s'enregistrer — ou pire, à croire le stock à zéro.
        <PanneBanner
          titre={t("pharmacie.panne_titre")}
          consigne={t("pharmacie.panne_consigne_vente")}
          detail={res.error}
        />
      )}
    </main>
  );
}
