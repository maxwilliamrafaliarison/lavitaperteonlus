import type { Metadata } from "next";
import Image from "next/image";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/lib/i18n";
import { getFirstName } from "@/lib/utils";

import { AppTile, type HubApp } from "./app-tile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Applications" };

export default async function HubPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { name, role, lang } = session.user;
  const t = getT(lang);

  const apps: HubApp[] = [
    {
      key: "logistique",
      title: t("hub.app_logistique"),
      description: t("hub.app_logistique_desc"),
      href: "/dashboard",
      icon: "cpu",
      tone: "primary",
      visible: can(role, "app:logistique"),
      status: "live",
    },
    {
      key: "pharmacie",
      title: t("hub.app_pharmacie"),
      description: t("hub.app_pharmacie_desc"),
      href: "/pharmacie",
      icon: "pill",
      tone: "success",
      visible: can(role, "app:pharmacie"),
      status: "live",
    },
    {
      key: "patients",
      title: t("hub.app_patients"),
      description: t("hub.app_patients_desc"),
      href: "/patients",
      icon: "heart-pulse",
      tone: "cyan",
      visible: can(role, "app:patients"),
      status: "soon",
    },
    {
      key: "site",
      title: t("hub.app_site"),
      description: t("hub.app_site_desc"),
      href: "https://www.lavitaperte.org",
      icon: "globe",
      tone: "warning",
      visible: true,
      status: "external",
    },
  ];

  const visibleApps = apps.filter((a) => a.visible);

  return (
    <>
      {/* Image de fond Centre REX + voile flouté (cohérence pages publiques) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <Image
          src="/logo/centre-rex.jpg"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-background/70 backdrop-blur-2xl"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/12 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      {/* Header minimal : logo + menu utilisateur */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
          <BrandLogo />
          <UserMenu
            name={name ?? ""}
            email={session.user.email ?? ""}
            role={role}
            lang={lang}
          />
        </div>
      </header>

      {/* Springboard */}
      <main
        id="main-content"
        className="relative z-10 mx-auto flex min-h-[calc(100vh-180px)] max-w-6xl flex-col justify-center px-6 py-10 md:px-10"
      >
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {t("hub.welcome", { name: getFirstName(name) })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {t("hub.subtitle")}
          </p>
        </div>

        <ul
          role="list"
          className="mx-auto mt-14 grid grid-cols-2 place-items-center gap-x-8 gap-y-10 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-12"
        >
          {visibleApps.map((app) => (
            <li key={app.key}>
              <AppTile app={app} soonLabel={t("hub.coming_soon")} />
            </li>
          ))}
        </ul>
      </main>

      {/* Footer minimal */}
      <footer className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-5 md:px-10">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} La Vita Per Te · ONG-ODV Alfeo Corassori
          </p>
        </div>
      </footer>
    </>
  );
}
