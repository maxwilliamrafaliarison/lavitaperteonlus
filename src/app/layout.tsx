import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";

import { auth } from "@/auth";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/sonner";
import { getT, isLang, type Lang } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "La Vita Per Te · Parc Informatique",
    template: "%s · La Vita Per Te",
  },
  description:
    "Tableau de bord du parc informatique. Centre REX Fianarantsoa et Centre MIARAKA. ONG-ODV Alfeo Corassori.",
  applicationName: "La Vita Per Te Dashboard",
  authors: [{ name: "La Vita Per Te" }],
  creator: "La Vita Per Te",
  publisher: "ONG-ODV Alfeo Corassori",
  keywords: [
    "La Vita Per Te",
    "Centre REX",
    "MIARAKA",
    "Fianarantsoa",
    "parc informatique",
    "Akbaraly Foundation",
  ],
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Résout la langue active pour SSR :
 * 1. session.user.lang si authentifié (source de vérité)
 * 2. cookie `lvpt_lang` (choix client persisté)
 * 3. fallback "fr"
 *
 * Garantit que <html lang="…"> reflète la vraie langue affichée
 * (RGAA 8.3 — indication de langue).
 */
async function resolveLang(): Promise<Lang> {
  try {
    const session = await auth();
    if (session?.user?.lang && isLang(session.user.lang)) {
      return session.user.lang;
    }
  } catch {
    // pas de session, on ignore
  }
  try {
    const c = await cookies();
    const raw = c.get("lvpt_lang")?.value;
    if (isLang(raw)) return raw;
  } catch {
    // ignore
  }
  return "fr";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await resolveLang();
  const t = getT(lang);

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full font-sans antialiased">
        {/* Lien d'évitement clavier — invisible sauf au focus (RGAA 12.7) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-2xl focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        >
          {t("a11y.skip_to_content")}
        </a>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
