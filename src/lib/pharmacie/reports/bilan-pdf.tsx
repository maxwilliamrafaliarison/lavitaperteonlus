import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToStream,
  type DocumentProps,
} from "@react-pdf/renderer";

import { styles, fmtDate, fmtAriary, COLORS } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock, KpiGrid, SectionHeader, EmptyState } from "@/lib/reports/layout";
import type { ReportContext } from "@/lib/reports/types";
import type { BilanData } from "./bilan";
import { bilanKpis } from "./bilan";

/* Bilan mensuel de la pharmacie — document de gestion pluri-sections. */

const b = StyleSheet.create({
  legal: { fontSize: 8, color: COLORS.textMuted, marginTop: 2, lineHeight: 1.4 },
  twoCol: { flexDirection: "row", gap: 16, marginTop: 6 },
  col: { flex: 1 },
  note: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    minHeight: 54,
    padding: 10,
  },
  noteLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, marginBottom: 4 },
  bar: { height: 7, borderRadius: 3, backgroundColor: COLORS.brand, marginTop: 3 },
  barBg: { height: 7, borderRadius: 3, backgroundColor: COLORS.bgHeader },
});

function Th({ w, right, children }: { w: string; right?: boolean; children: React.ReactNode }) {
  return <Text style={[styles.th, { width: w }, right ? { textAlign: "right" } : {}]}>{children}</Text>;
}
function Td({ w, right, mono, children }: { w: string; right?: boolean; mono?: boolean; children: React.ReactNode }) {
  return <Text style={[mono ? styles.tdMono : styles.td, { width: w }, right ? { textAlign: "right" } : {}]}>{children}</Text>;
}
function Row({ children, i }: { children: React.ReactNode; i: number }) {
  return <View style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>{children}</View>;
}

export function BilanMensuelPdf({ data, ctx }: { data: BilanData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const titre = it ? `Bilancio mensile della farmacia` : `Bilan mensuel de la pharmacie`;
  const sub = it
    ? `${data.moisLabel} · Centro REX · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, ctx.lang)}`
    : `${data.moisLabel} · Centre REX · Établi par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, ctx.lang)}`;

  return (
    <Document title={titre} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="BILAN" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={titre} subtitle={sub} />
        <Text style={b.legal}>
          Pharmacie du Centre REX — La Vita Per Te (ONG-ODV Alfeo Corassori) · NIF 5001978624 · STAT
          94111212015000569 · IN 34 Ambatolahikisoa, Fianarantsoa · À l'attention de la Direction
        </Text>

        {/* 1. Tableau de bord */}
        <SectionHeader title={it ? "1. Cruscotto" : "1. Tableau de bord"} />
        <KpiGrid kpis={bilanKpis(data).map((k) => ({ label: k.label, value: k.valeur, hint: k.hint }))} />

        {/* 2. Activité commerciale */}
        <SectionHeader
          title={it ? "2. Attività commerciale" : "2. Activité commerciale"}
          meta={`${data.nbVentes} ${it ? "vendite" : "ventes"} · ${fmtAriary(data.caComptant)} ${it ? "incassati" : "encaissés"}`}
        />
        <View style={b.twoCol}>
          <View style={b.col}>
            <Text style={[styles.th, { marginBottom: 3 }]}>{it ? "Top prodotti" : "Top produits (par CA)"}</Text>
            {data.topProduits.length === 0 ? (
              <EmptyState message={it ? "Nessuna vendita." : "Aucune vente."} />
            ) : (
              <>
                <View style={styles.tableRowHeader}>
                  <Th w="58%">{it ? "Prodotto" : "Produit"}</Th>
                  <Th w="24%" right>CA</Th>
                  <Th w="18%" right>%</Th>
                </View>
                {data.topProduits.map((p, i) => (
                  <Row key={i} i={i}>
                    <Td w="58%">{p.nom}</Td>
                    <Td w="24%" right mono>{fmtAriary(p.ca)}</Td>
                    <Td w="18%" right mono>{p.part.toFixed(1)}</Td>
                  </Row>
                ))}
              </>
            )}
          </View>
          <View style={b.col}>
            <Text style={[styles.th, { marginBottom: 3 }]}>{it ? "Per classe terapeutica" : "Par classe thérapeutique"}</Text>
            {data.parClasse.length === 0 ? (
              <EmptyState message={it ? "—" : "—"} />
            ) : (
              data.parClasse.slice(0, 8).map((c, i) => (
                <View key={i} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 8.5 }}>{c.classe}</Text>
                    <Text style={{ fontSize: 8.5 }}>{fmtAriary(c.ca)} · {c.part.toFixed(0)}%</Text>
                  </View>
                  <View style={b.barBg}>
                    <View style={[b.bar, { width: `${Math.max(2, Math.min(100, c.part))}%` }]} />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* 3. Mouvements du mois */}
        <SectionHeader
          title={it ? "3. Movimenti del mese" : "3. Mouvements du mois"}
          meta={`${it ? "Entrate" : "Entrées"} ${fmtAriary(data.entreesMois)} · ${it ? "Uscite" : "Sorties"} ${fmtAriary(data.caComptant + data.valeurPec)}`}
        />
        {data.entreesParFournisseur.length === 0 ? (
          <EmptyState message={it ? "Nessun carico questo mese." : "Aucune entrée ce mois-ci."} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="60%">{it ? "Fornitore" : "Fournisseur"}</Th>
              <Th w="18%" right>{it ? "Carichi" : "Entrées"}</Th>
              <Th w="22%" right>{it ? "Importo" : "Montant"}</Th>
            </View>
            {data.entreesParFournisseur.map((f, i) => (
              <Row key={i} i={i}>
                <Td w="60%">{f.fournisseur}</Td>
                <Td w="18%" right mono>{String(f.nb)}</Td>
                <Td w="22%" right mono>{fmtAriary(f.montant)}</Td>
              </Row>
            ))}
          </>
        )}
      </Page>

      {/* Page 2 — santé du stock, PEC, annexe */}
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="BILAN" />
        <ReportFooter lang={ctx.lang} />

        <SectionHeader
          title={it ? "4. Salute dello stock & qualità" : "4. Santé du stock & qualité"}
          meta={`${data.nbRuptures} ${it ? "rotture" : "ruptures"} · ${data.nbACommander} ${it ? "da ordinare" : "à commander"} · ${data.perimes.length} ${it ? "scaduti" : "périmés"}`}
        />
        {data.aCommander.length > 0 && (
          <View>
            <Text style={[styles.th, { marginTop: 4, marginBottom: 2 }]}>{it ? "Da ordinare (sotto soglia)" : "À commander (sous seuil)"}</Text>
            <View style={styles.tableRowHeader}>
              <Th w="40%">{it ? "Prodotto" : "Produit"}</Th>
              <Th w="26%">{it ? "Fornitore" : "Fournisseur"}</Th>
              <Th w="14%" right>Stock</Th>
              <Th w="20%" right>{it ? "Da ordinare" : "À commander"}</Th>
            </View>
            {data.aCommander.slice(0, 20).map((r, i) => (
              <Row key={i} i={i}>
                <Td w="40%">{r.designation}</Td>
                <Td w="26%">{r.fournisseur}</Td>
                <Td w="14%" right mono>{r.stock}</Td>
                <Text style={[styles.td, { width: "20%", textAlign: "right", color: COLORS.brand, fontWeight: 700 }]}>{r.aCommander}</Text>
              </Row>
            ))}
          </View>
        )}
        {(data.perimes.length > 0 || data.bientot.length > 0) && (
          <View>
            <Text style={[styles.th, { marginTop: 8, marginBottom: 2 }]}>{it ? "Scadenze" : "Péremptions (périmés + < 90 j)"}</Text>
            <View style={styles.tableRowHeader}>
              <Th w="52%">{it ? "Prodotto" : "Produit"}</Th>
              <Th w="28%">{it ? "Scadenza" : "Péremption"}</Th>
              <Th w="20%" right>{it ? "Giorni" : "Jours"}</Th>
            </View>
            {[...data.perimes, ...data.bientot].slice(0, 16).map((r, i) => (
              <Row key={i} i={i}>
                <Td w="52%">{r.designation}</Td>
                <Td w="28%" mono>{r.peremption}</Td>
                <Text style={[styles.tdMono, { width: "20%", textAlign: "right", color: r.perime ? COLORS.critical : COLORS.warning }]}>
                  {r.jours === null ? "—" : r.perime ? String(r.jours) : `J-${r.jours}`}
                </Text>
              </Row>
            ))}
          </View>
        )}
        {data.ruptures.length > 0 && (
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 6 }}>
            {it ? "Rotture" : "En rupture"} ({data.ruptures.length}) : {data.ruptures.map((r) => r.designation).join(" · ")}
          </Text>
        )}

        {/* 5. PEC */}
        <SectionHeader
          title={it ? "5. Prese in carico (impatto sociale)" : "5. Prises en charge (impact social)"}
          meta={`${fmtAriary(data.valeurPec)} ${it ? "dispensati gratuitamente" : "dispensés gratuitement"}`}
        />
        {data.pecParEntite.length === 0 ? (
          <EmptyState message={it ? "Nessuna presa in carico questo mese." : "Aucune prise en charge ce mois-ci."} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="60%">{it ? "Ente" : "Entité prise en charge"}</Th>
              <Th w="18%" right>Nb</Th>
              <Th w="22%" right>{it ? "Valore" : "Valeur"}</Th>
            </View>
            {data.pecParEntite.map((p, i) => (
              <Row key={i} i={i}>
                <Td w="60%">{p.entite}</Td>
                <Td w="18%" right mono>{String(p.nb)}</Td>
                <Td w="22%" right mono>{fmtAriary(p.valeur)}</Td>
              </Row>
            ))}
          </>
        )}

        {/* Observations */}
        <SectionHeader title={it ? "Osservazioni" : "Observations du pharmacien"} />
        <View style={b.note}>
          <Text style={b.noteLabel}>{it ? "Note e piano d'azione" : "Commentaire & plan d'action"}</Text>
        </View>
      </Page>

      {/* Page 3+ — annexe fiche de stock */}
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="BILAN" />
        <ReportFooter lang={ctx.lang} />
        <SectionHeader
          title={it ? "Allegato — Scheda di stock" : "Annexe — Fiche de stock détaillée"}
          meta={it ? "Per prodotto : CA delle uscite del mese e stock attuale valorizzato" : "Par produit : CA des sorties du mois et stock actuel valorisé"}
        />
        <View style={styles.tableRowHeader}>
          <Th w="38%">{it ? "Prodotto" : "Produit"}</Th>
          <Th w="22%">{it ? "Classe" : "Classe"}</Th>
          <Th w="20%" right>{it ? "CA uscite" : "CA sorties"}</Th>
          <Th w="10%" right>Stock</Th>
          <Th w="10%" right>{it ? "Valore" : "Valeur"}</Th>
        </View>
        {data.fiche.map((f, i) => (
          <Row key={i} i={i}>
            <Td w="38%">{f.designation}</Td>
            <Td w="22%">{f.classe}</Td>
            <Td w="20%" right mono>{f.caSorties > 0 ? fmtAriary(f.caSorties) : "—"}</Td>
            <Td w="10%" right mono>{f.stockLabel}</Td>
            <Td w="10%" right mono>{Math.round(f.valeurStock / 1000)}k</Td>
          </Row>
        ))}
      </Page>
    </Document>
  );
}

export async function renderBilanMensuel(data: BilanData, ctx: ReportContext): Promise<NodeJS.ReadableStream> {
  return await renderToStream(
    (<BilanMensuelPdf data={data} ctx={ctx} />) as React.ReactElement<DocumentProps> as never,
  );
}
