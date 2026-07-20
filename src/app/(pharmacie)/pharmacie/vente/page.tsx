import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock, listEntitesPec } from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { PanneBanner } from "@/components/layout/panne-banner";
import { getT } from "@/lib/i18n";
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

  const [res, entitesRes] = await Promise.all([
    safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []),
    safe<EntitePec[]>(() => listEntitesPec(), []),
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
        <VenteForm produits={res.data} entites={entitesRes.data} lang={lang} />
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
