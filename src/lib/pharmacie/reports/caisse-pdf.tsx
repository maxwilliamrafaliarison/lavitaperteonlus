import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";

import { styles, COLORS, fmtAriary } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock, ContextBox, KpiGrid } from "@/lib/reports/layout";
import type { EtatCaisse } from "@/lib/pharmacie/caisse-etat";
import {
  type EntiteLegale,
  MENTION_CONSERVATION,
  MENTION_DEVISE,
} from "@/lib/pharmacie/entite";

/* ============================================================
   ÉTAT DE CAISSE — pièce justificative de la clôture
   ============================================================

   Un exemplaire s'imprime au comptoir et se range avec le fond de caisse ;
   le même document part à l'administration. C'est une pièce comptable :
   elle porte qui a ouvert, qui a clos, ce qui était attendu, ce qui a été
   compté, et l'écart — signé, jamais maquillé.

   L'écart est la seule chose qu'on vient y chercher. Il occupe donc une
   ligne à lui, pleine largeur, colorée selon qu'il tombe juste, qu'il
   manque ou qu'il excède.
   ============================================================ */

function heure(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Indian/Antananarivo",
  });
}

function jour(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });
}

function nomDe(email: string): string {
  const avant = (email || "").split("@")[0] ?? "";
  const brut = avant.split(".")[0] || avant || "—";
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

export function EtatCaissePdf({
  etat,
  entite,
  numero,
}: {
  etat: EtatCaisse;
  entite: EntiteLegale;
  /** Numéro de pièce dans la série continue de l'année. */
  numero: string;
}) {
  const s = etat.session;
  const close = s.statut === "fermee";
  const ecart = etat.ecart ?? 0;
  // Vert si le compte tombe juste, rouge s'il manque, ambre s'il excède :
  // un excédent n'est pas une bonne nouvelle, c'est une vente non saisie.
  const tonEcart = ecart === 0 ? COLORS.ok : ecart < 0 ? COLORS.critical : COLORS.warning;
  const fondEcart = ecart === 0 ? COLORS.okSoft : ecart < 0 ? COLORS.criticalSoft : COLORS.warningSoft;

  return (
    <Document title={`${numero} — État de caisse`} author={entite.denomination}>
      {/* Marges resserrées pour cette pièce seulement : un relevé de caisse
            doit tenir sur UNE feuille — c'est ce qu'on signe et qu'on classe.
            Les styles partagés restent intacts pour les autres rapports. */}
      <Page size="A4" style={[styles.page, { paddingTop: 56, paddingBottom: 44 }]}>
        <ReportHeader
          ctx={{ lang: "fr", generatedBy: "Pharmacie", generatedAt: new Date().toISOString() }}
          reportNumber={numero}
          sansMarque
        />
        <ReportFooter lang="fr" />

        <TitleBlock
          title="Relevé de caisse journalier"
          subtitle={`Pièce justificative n° ${numero} · Pharmacie · Centre ${s.site} · ${jour(s.ouverte_le)}`}
        />

        {/* ---- Identification de l'émetteur : mention obligatoire ---- */}
        <View
          style={{
            marginBottom: 8,
            paddingBottom: 6,
            borderBottom: `0.5 solid ${COLORS.border}`,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.text }}>
            {entite.denomination}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            {entite.formeJuridique}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            Adresse : {entite.siegeSocial}
            {entite.codeFiscal ? ` · Code fiscal ${entite.codeFiscal}` : ""}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            Établissement : {entite.etablissement}
            {entite.nif ? ` · NIF ${entite.nif}` : ""}
            {entite.stat ? ` · STAT ${entite.stat}` : ""}
          </Text>
        </View>

        <ContextBox
          items={[
            { label: "Nature de la pièce", value: "Relevé de caisse — espèces" },
            {
              label: "Période couverte",
              value: `${heure(s.ouverte_le)} - ${close ? heure(s.fermee_le) : "en cours"}`,
            },
            { label: "Devise", value: "MGA (ariary)" },
            { label: "Établi par", value: `${nomDe(s.ouverte_par)} à ${heure(s.ouverte_le)}` },
            {
              label: "Arrêté par",
              value: close ? `${nomDe(s.fermee_par)} à ${heure(s.fermee_le)}` : "Séance en cours",
            },
            { label: "Fonds de caisse initial", value: fmtAriary(s.fonds_initial) },
          ]}
        />

        <KpiGrid
          kpis={[
            {
              label: "Ventes comptant",
              value: String(etat.nbVentesComptant),
              hint: fmtAriary(etat.totalComptant),
            },
            {
              label: "Prises en charge",
              value: String(etat.nbPec),
              hint: `${fmtAriary(etat.valeurPec)} · non encaissé`,
            },
            {
              label: "Ventes annulées",
              value: String(etat.nbAnnulees),
              hint: etat.nbAnnulees > 0 ? "stock rendu" : "aucune",
            },
          ]}
        />

        {/* ---- Le rapprochement ---- */}
        <Titre texte="Rapprochement du tiroir" />
        <View style={{ marginBottom: 4 }}>
          <Ligne libelle="Fonds de caisse initial" valeur={fmtAriary(s.fonds_initial)} />
          <Ligne
            libelle={`Ventes comptant de la séance (${etat.nbVentesComptant})`}
            valeur={fmtAriary(etat.totalComptant)}
          />
          <Ligne libelle="Total théorique attendu" valeur={fmtAriary(etat.theorique)} gras />
          <Ligne
            libelle="Espèces comptées"
            valeur={etat.comptees == null ? "—" : fmtAriary(etat.comptees)}
            gras
          />
        </View>

        <View
          style={{
            marginTop: 4,
            marginBottom: 8,
            padding: 8,
            backgroundColor: fondEcart,
            borderLeft: `3 solid ${tonEcart}`,
          }}
        >
          <Text style={{ fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            Écart constaté
          </Text>
          <Text style={{ fontSize: 17, fontWeight: 700, color: tonEcart, marginTop: 1 }}>
            {ecart > 0 ? "+" : ""}
            {etat.ecart == null ? "—" : fmtAriary(ecart)}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 3 }}>
            {etat.ecart == null
              ? "La séance n'est pas encore clôturée."
              : ecart === 0
                ? "Le compte tombe juste."
                : ecart < 0
                  ? "Il manque des espèces dans le tiroir par rapport aux ventes enregistrées."
                  : "Le tiroir contient plus que les ventes enregistrées — une vente a pu ne pas être saisie."}
          </Text>
        </View>

        {/* ---- Qui a servi ---- */}
        {etat.parOperatrice.length > 0 && (
          <>
            <Titre texte="Ventes comptant par personne" />
            <View style={{ marginBottom: 6 }}>
              {etat.parOperatrice.map((o) => (
                <Ligne
                  key={o.email}
                  libelle={`${o.nom} — ${o.nbVentes} vente(s)`}
                  valeur={fmtAriary(o.totalComptant)}
                />
              ))}
            </View>
            <Text style={{ fontSize: 7.5, color: COLORS.textLight, marginBottom: 6 }}>
              Le tiroir est commun : cette répartition indique qui a servi, elle n&apos;impute
              l&apos;écart à personne.
            </Text>
          </>
        )}

        {s.note ? (
          <>
            <Titre texte="Observation à la clôture" />
            <Text style={{ fontSize: 9.5, color: COLORS.text, lineHeight: 1.4, marginBottom: 4 }}>
              {s.note}
            </Text>
          </>
        ) : null}

        {/* ---- Attestation et signatures ---- */}
        <Titre texte="Attestation" />
        <Text style={{ fontSize: 8.5, color: COLORS.text, lineHeight: 1.4, marginBottom: 2 }}>
          Le soussigné atteste avoir procédé au comptage physique des espèces en caisse à la
          clôture de la séance et certifie la sincérité des montants portés au présent relevé.
        </Text>

        <View style={{ flexDirection: "row", gap: 20, marginTop: 6 }}>
          <Signature
            titre="Établi et compté par"
            nom={close ? nomDe(s.fermee_par) : ""}
            qualite="Dispensatrice"
          />
          <Signature titre="Vérifié par" nom="" qualite="Responsable administratif" />
          <Signature titre="Approuvé par" nom="" qualite="Direction" />
        </View>

        {/* ---- Mentions légales : ce qui fait la pièce justificative ---- */}
        <View
          style={{
            marginTop: 8,
            paddingTop: 5,
            borderTop: `0.5 solid ${COLORS.border}`,
          }}
        >
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5 }}>
            {MENTION_DEVISE}
          </Text>
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5, marginTop: 2 }}>
            {MENTION_CONSERVATION}
          </Text>
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5, marginTop: 2 }}>
            Document établi par traitement informatique à partir des ventes enregistrées ; les
            écritures sont conservées de manière inaltérable et chaque correction reste tracée.
            Référence interne : séance {s.id}.
          </Text>
          {entite.incomplete && (
            <Text style={{ fontSize: 7.5, color: COLORS.critical, lineHeight: 1.5, marginTop: 4 }}>
              Mentions d&apos;immatriculation incomplètes ({entite.manquants.join(", ")}) : à
              compléter dans les paramètres de l&apos;application avant archivage comptable.
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}

/** Intitulé de section, plus resserré que celui des rapports longs. */
function Titre({ texte }: { texte: string }) {
  return (
    <Text
      style={{
        fontSize: 10.5,
        fontFamily: "Helvetica-Bold",
        color: COLORS.brand,
        marginTop: 8,
        marginBottom: 4,
        paddingBottom: 2,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.brand,
      }}
    >
      {texte}
    </Text>
  );
}

function Ligne({ libelle, valeur, gras }: { libelle: string; valeur: string; gras?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 3.5,
        borderBottom: `0.5 solid ${COLORS.borderLight}`,
      }}
    >
      <Text style={{ fontSize: 9.5, color: gras ? COLORS.text : COLORS.textMuted, fontWeight: gras ? 700 : 400 }}>
        {libelle}
      </Text>
      <Text style={{ fontSize: 9.5, color: COLORS.text, fontWeight: gras ? 700 : 400 }}>{valeur}</Text>
    </View>
  );
}

function Signature({ titre, nom, qualite }: { titre: string; nom: string; qualite: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 8, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {titre}
      </Text>
      <Text style={{ fontSize: 7.5, color: COLORS.textLight, marginTop: 1 }}>{qualite}</Text>
      {nom ? <Text style={{ fontSize: 9.5, marginTop: 3, fontWeight: 700 }}>{nom}</Text> : null}
      {/* Espace de signature manuscrite : la pièce se range en papier. */}
      <View style={{ marginTop: nom ? 12 : 18, borderTop: `0.5 solid ${COLORS.border}` }} />
      <Text style={{ fontSize: 7, color: COLORS.textLight, marginTop: 2 }}>Date et signature</Text>
    </View>
  );
}
