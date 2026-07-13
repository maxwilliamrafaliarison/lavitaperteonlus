import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listProduits } from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { Produit } from "@/lib/pharmacie/types";

import { ProduitForm } from "./produit-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NouveauProduitPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pharmacie:stock")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const res = await safe<Produit[]>(() => listProduits(), []);
  const uniques = (vals: string[]) =>
    Array.from(new Set(vals.map((v) => v.trim()).filter(Boolean))).sort();

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
          {t("pharmacie.produit_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pharmacie.produit_subtitle")}
        </p>
      </div>

      <ProduitForm
        classes={uniques(res.data.map((p) => p.classe))}
        formes={uniques(res.data.map((p) => p.forme))}
        lang={lang}
      />
    </main>
  );
}
