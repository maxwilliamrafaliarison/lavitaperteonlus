import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getCaisseOuverte, type CaisseSession } from "@/lib/pharmacie/caisse";
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

  const [res, entitesRes, stockRes, caisseRes] = await Promise.all([
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
      // Péremption la plus proche parmi les lots ENCORE VENDABLES : c'est la
      // date que la dispensatrice lit sur le rayon — celle du lot que le
      // FEFO servira en premier.
      const peremptions: Record<string, string> = {};
      for (const [produitId, lots] of parLot) {
        for (const l of lots) {
          if (estPerime(l.dateExpiration, jour)) continue;
          const acc = (out[produitId] ??= { gros: 0, detail: 0 });
          acc.gros += Math.max(0, l.gros);
          acc.detail += Math.max(0, l.detail);
          if (
            l.dateExpiration &&
            l.gros + l.detail > 0 &&
            (!peremptions[produitId] || l.dateExpiration < peremptions[produitId])
          ) {
            peremptions[produitId] = l.dateExpiration;
          }
        }
      }
      return { out, peremptions };
    }, { out: {}, peremptions: {} } as { out: Record<string, { gros: number; detail: number }>; peremptions: Record<string, string> }),
    /* La caisse peut ne pas exister encore (migration 017 non passée) : dans
       ce cas l'écran vit sans elle — on distingue « fermée » (null) de
       « indisponible » (erreur), car la première BLOQUE l'encaissement et la
       seconde ne doit surtout pas le faire. */
    safe<CaisseSession | null | "indisponible">(
      () => getCaisseOuverte(),
      "indisponible" as const,
    ),
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
        <VenteForm
          produits={res.data}
          entites={entitesRes.data}
          lang={lang}
          stockParCompartiment={stockRes.data.out}
          peremptions={stockRes.data.peremptions}
          caisse={caisseRes.data === "indisponible" ? null : caisseRes.data}
          peutStock={can(session.user.role, "pharmacie:stock")}
        caisseDisponible={caisseRes.data !== "indisponible"}
        />
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
