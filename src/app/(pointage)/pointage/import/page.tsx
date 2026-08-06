import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/lib/i18n";

import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import des pointages" };

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Importer engage la paie : réservé à l'administrateur.
  if (!can(session.user.role, "pointage:collecter")) redirect("/pointage");
  const lang = session.user.lang;
  const t = getT(lang);

  return (
    <main id="main-content" className="mx-auto max-w-3xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pointage"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pointage.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pointage.nav_import")}
        </h1>
      </div>

      <ImportForm lang={lang} />
    </main>
  );
}
