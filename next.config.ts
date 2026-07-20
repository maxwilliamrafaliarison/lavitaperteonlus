import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le rendu PDF (ticket/facture) lit le logo depuis le disque au runtime.
  // Les fichiers de `public/` ne sont pas tracés dans les lambdas par
  // défaut : on force l'inclusion du logo pour la route de documents, sinon
  // le PDF s'imprimerait sans logo en production (le code le gère, mais on
  // veut le logo).
  outputFileTracingIncludes: {
    "/api/pharmacie/ventes/[id]/[doc]": ["./public/logo/**"],
  },
};

export default nextConfig;
