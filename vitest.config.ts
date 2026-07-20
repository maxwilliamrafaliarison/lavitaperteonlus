import { defineConfig } from "vitest/config";
import path from "node:path";

// Config TEMPORAIRE (rendu PDF) — résout l'alias @/ vers src/.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
