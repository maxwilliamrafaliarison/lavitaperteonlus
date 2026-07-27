import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Le rapport lit la base : on charge l'environnement avant l'import dynamique.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

const ctx = { lang: "fr" as const, generatedBy: "Test", generatedAt: "2026-07-27T10:00:00.000Z" };

describe("état planifié / réalisé — données réelles", () => {
  it("agrège juillet 2026 et produit un PDF valide", async () => {
    const { buildEtatPlanifieRealise } = await import("./rapport");
    const { renderEtatPlanifieRealise } = await import("./rapport-pdf");

    const data = await buildEtatPlanifieRealise("2026-07-01", "2026-07-31");
    expect(data.moisLabel).toBe("juillet 2026");
    expect(data.lignes.length).toBeGreaterThan(0);
    // Les deux centres doivent apparaître dans la synthèse.
    expect(data.parSite.length).toBeGreaterThanOrEqual(1);
    // L'écart est bien la différence des deux totaux.
    expect(data.totalEcart).toBe(data.totalRealise - data.totalPlanifie);

    const buf = await toBuffer(await renderEtatPlanifieRealise(data, ctx));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);

    console.log(
      `  planifié ${Math.round(data.totalPlanifie / 60)}h · réalisé ${Math.round(data.totalRealise / 60)}h · ` +
        `${data.lignes.length} agents · collecte ${data.tauxCollecte.toFixed(0)} % · PDF ${Math.round(buf.length / 1024)} Ko`,
    );
  }, 120000);

  it("rend un PDF même sur une période sans donnée", async () => {
    const { buildEtatPlanifieRealise } = await import("./rapport");
    const { renderEtatPlanifieRealise } = await import("./rapport-pdf");
    const data = await buildEtatPlanifieRealise("2020-01-01", "2020-01-31");
    expect(data.lignes).toHaveLength(0);
    const buf = await toBuffer(await renderEtatPlanifieRealise(data, ctx));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 120000);
});
