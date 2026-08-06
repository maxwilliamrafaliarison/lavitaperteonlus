#!/usr/bin/env node
/**
 * FICHE FOURNISSEURS — données relevées sur les factures originales
 * scannées le 06/08/2026. Chaque champ vient d'un en-tête de facture,
 * jamais d'une supposition. Rejouable : l'upsert écrase par le nom.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { sbSelect, sbInsert, sbUpdate } = await import("../src/lib/supabase-server.ts");

const FOURNISSEURS = [
  { nom: "PHARMATEK", telephone: "22 523 22 · 22 597 25", email: "pharmatek@orange.fr",
    adresse: "Lot II R 145 B-Ambohitrakely, BP 8591, Antananarivo 101",
    nif: "4000671463", stat: "51321/11/2003/0/10135", rc: "RC 2003 B 00380",
    note: "Importateur-grossiste répartiteur de produits pharmaceutiques." },
  { nom: "MEDICO", telephone: "76 695 84 · 76 652 47", email: "sales.tana@medico.mg",
    adresse: "Lot 59 Bis IVV Andraharo, Antananarivo 101",
    nif: "3000255333", stat: "46101112015010550", rc: "RC N 20038-982",
    note: "MEDICO S.A. « Le carrefour du médicament générique ». Agences : Antsiranana (13 rue Louis Brunet), Toamasina (Bazary kely). Réclamations via sales.tana@medico.mg." },
  { nom: "LABOREX", telephone: "+261 20 22 211 03", email: "",
    adresse: "Lot III U 49 A Ter A Ankadimbahoaka, Antananarivo 101",
    nif: "0000000139", stat: "46496 11 1974 0 10002", rc: "RCS 2003 B 00356",
    note: "Laborex Madagascar · groupe CFAO Healthcare." },
  { nom: "SOPHARMAD", telephone: "22 267 02 · 033 11 431 58 · 032 07 267 02", email: "commercial@sopharmad.mg",
    adresse: "Zone Filatex Bâtiment F18, Ankadimbahoaka, Antananarivo 101",
    nif: "1000003339", stat: "464 9611 1988 000007", rc: "RCS 2003B00425 · CIF 023237/DGI-M du 26/08/2025",
    note: "Réclamations sous 48 h après réception. Articles froids (2–8 °C) et articles en promotion non repris ni échangés." },
  { nom: "SALAMA", telephone: "(261 32) 02 290 95 · (261 33) 05 449 22 · (261 34) 97 469", email: "",
    adresse: "Anosiala Ambohidratrimo, Lot III A 112, BP 3697, Antananarivo 105",
    nif: "3000000670", stat: "46496 11 1996 0 100 11", rc: "",
    note: "Centrale d'achats de médicaments essentiels de Madagascar." },
  { nom: "MADABEL", telephone: "034 14 603 23 · 032 04 603 23", email: "",
    adresse: "Lot III O 71 D Ouest Ambohijanahary, Antananarivo",
    nif: "2000010477", stat: "47722 11 2009 0 10736", rc: "RC 2009 B 00721",
    note: "MADABEL S.A.R.L — consommables médicaux (compresses, fils de suture)." },
];

const { rows } = await sbSelect<{ id: string; nom: string }>("pharmacie", "fournisseurs", { limit: 500 });
const parNom = new Map(rows.map((r) => [r.nom.trim().toUpperCase(), r]));
let n = 1 + rows.length;
for (const f of FOURNISSEURS) {
  const existant = parNom.get(f.nom);
  if (existant) {
    await sbUpdate("pharmacie", "fournisseurs", { id: `eq.${existant.id}` }, f);
    console.log(`  ~ ${f.nom} mis à jour`);
  } else {
    await sbInsert("pharmacie", "fournisseurs", [{ id: `FRN-${String(n++).padStart(3, "0")}`, ...f }]);
    console.log(`  + ${f.nom} créé`);
  }
}
