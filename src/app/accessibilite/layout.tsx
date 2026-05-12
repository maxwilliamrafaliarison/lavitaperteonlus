import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Déclaration d'accessibilité",
};

export default function AccessibilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
