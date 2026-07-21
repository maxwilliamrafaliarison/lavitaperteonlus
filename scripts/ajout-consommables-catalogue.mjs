const URL = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
async function pg(method, path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t}`); return t ? JSON.parse(t) : null;
}

// Données du CATALOGUE PHARMACIE REX (consommables absents de l'app).
const NOUVEAUX = [
  { id: "PHA-068", designation: "COMPRESSE NON STERILE 10X10", conditionnement: "BOITE DE 100", prixAchat: 19500, prixVente: 25350, prixUnit: 254, facteur: 100, unite: "pièce" },
  { id: "PHA-069", designation: "FIL A PEAU 2.0", conditionnement: "BOITE DE 12", prixAchat: 42000, prixVente: 54600, prixUnit: 4550, facteur: 12, unite: "fil" },
  { id: "PHA-070", designation: "FIL RESORBABLE/VICRYL 2.0", conditionnement: "BOITE DE 12", prixAchat: 61200, prixVente: 79560, prixUnit: 6630, facteur: 12, unite: "fil" },
];

for (const p of NOUVEAUX) {
  const existe = await pg("GET", `produits?id=eq.${p.id}&select=id`);
  if (existe.length) { console.log(`= ${p.id} existe déjà`); continue; }
  await pg("POST", "produits", {
    id: p.id, code: p.id, designation: p.designation, dci: "", classe: "", forme: "", dosage: "",
    conditionnement: p.conditionnement, prix_achat: p.prixAchat, prix_vente: p.prixVente,
    prix_unitaire: p.prixUnit, prix_vente_detail: p.prixUnit, stock_min: 0, fournisseur: "",
    emplacement: "CONSOMMABLE", statut: "actif", createdAt: new Date().toISOString(),
    facteur_conversion: p.facteur, unite_detail: p.unite,
  });
  console.log(`✅ ${p.id} ${p.designation} créé — ×${p.facteur} ${p.unite}, prix ${p.prixVente} Ar (unité ${p.prixUnit} Ar), stock 0`);
}

// Vérif
const check = await pg("GET", "produits?id=in.(PHA-068,PHA-069,PHA-070)&select=id,designation,facteur_conversion,unite_detail,prix_vente,prix_vente_detail,statut&order=id.asc");
console.log("\nVérification :");
for (const p of check) console.log(`  ${p.id} ${p.designation.padEnd(28)} f=${p.facteur_conversion} ${p.unite_detail} | ${p.prix_vente}/${p.prix_vente_detail} Ar | ${p.statut}`);
const total = await pg("GET", "produits?select=id&limit=1000");
console.log(`\nTotal produits catalogue : ${total.length} (était 67)`);
