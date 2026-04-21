"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut } from "lucide-react";

import { logoutAuditAction } from "@/lib/auth/actions";
import { GlassCard } from "@/components/glass/glass-card";
import { getT, type Lang } from "@/lib/i18n";
import { getStoredLang } from "@/lib/i18n/persist";

/**
 * Page transitoire de déconnexion.
 * Appelée depuis le menu utilisateur via router.push("/logout").
 * Isole la logique de sign-out du cycle de vie du DropdownMenu
 * (évite Base UI #31 : portal unmount pendant un redirect).
 */
export default function LogoutPage() {
  const doneRef = React.useRef(false);
  const [lang, setLang] = React.useState<Lang>("fr");
  const t = getT(lang);

  React.useEffect(() => {
    setLang(getStoredLang() ?? "fr");
  }, []);

  React.useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    (async () => {
      // Audit best-effort (ne bloque pas la déconnexion)
      try {
        await logoutAuditAction();
      } catch {
        // ignore
      }
      // Sign out côté client — next-auth fait un window.location.href propre
      await signOut({ callbackUrl: "/login", redirect: true });
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <GlassCard intensity="strong" className="p-8 md:p-10 max-w-sm w-full">
        <div className="text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <LogOut className="size-6" />
          </div>
          <h1 className="mt-6 font-display text-xl font-semibold">
            {t("logout_page.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            {t("logout_page.subtitle")}
          </p>
        </div>
      </GlassCard>
    </main>
  );
}
