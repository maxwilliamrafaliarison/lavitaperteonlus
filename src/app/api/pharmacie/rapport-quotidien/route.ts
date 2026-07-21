import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  listProduitsAvecStock,
  listVentes,
  listLignesVente,
  listParametres,
} from "@/lib/pharmacie/sheets";
import { formaterQuantite, prixParUniteBase } from "@/lib/pharmacie/fractionnement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/pharmacie/rapport-quotidien
 *
 * Rapport quotidien par email : état du stock, ventes des dernières
 * 24 h, alertes péremption / stock bas. Déclenché par le cron Vercel
 * (vercel.json) chaque matin, ou manuellement par un admin connecté.
 *
 * Sécurité : soit Authorization: Bearer <CRON_SECRET> (cron Vercel),
 * soit session admin/pharmacien.
 * Envoi : SMTP Gmail (GMAIL_USER + GMAIL_APP_PASSWORD).
 * Destinataires : paramètre email_rapports_destinataires du Sheet.
 */
export async function GET(req: NextRequest) {
  // --- Autorisation : cron OU admin connecté ---
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user || !can(session.user.role, "pharmacie:stock")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  // --- Config SMTP ---
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      {
        error:
          "SMTP non configuré : définissez GMAIL_USER et GMAIL_APP_PASSWORD sur Vercel.",
      },
      { status: 503 },
    );
  }

  try {
    const [produits, ventes, lignes, params] = await Promise.all([
      listProduitsAvecStock(),
      listVentes(),
      listLignesVente(),
      listParametres(),
    ]);

    const destinataires = (params.get("email_rapports_destinataires") ?? "")
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (destinataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire dans parametres!email_rapports_destinataires" },
        { status: 503 },
      );
    }

    // --- Calculs ---
    const actifs = produits.filter((p) => p.statut === "actif");
    // prixParUniteBase() et non prix_vente : le stock est en unités de base,
    // le multiplier par le prix de la BOÎTE surévaluerait d'un facteur 30
    // sur un produit fractionné.
    const valeurStock = actifs.reduce(
      (s, p) => s + p.stockBase * prixParUniteBase(p),
      0,
    );
    const perimes = actifs.filter(
      (p) => p.joursAvantPeremption !== null && p.joursAvantPeremption < 0,
    );
    const bientot = actifs
      .filter(
        (p) =>
          p.joursAvantPeremption !== null &&
          p.joursAvantPeremption >= 0 &&
          p.joursAvantPeremption <= 90,
      )
      .sort((a, b) => (a.joursAvantPeremption ?? 0) - (b.joursAvantPeremption ?? 0));
    const stockBas = actifs.filter(
      (p) => p.stock_min > 0 && p.stockBase <= p.stock_min,
    );

    const depuis = Date.now() - 24 * 3600 * 1000;
    const ventes24h = ventes.filter(
      (v) => new Date(v.timestamp).getTime() >= depuis && v.statut !== "annulee",
    );
    // Activité commerciale du jour, vue « responsable des ventes ».
    const ventesCash = ventes24h.filter((v) => v.typeVente !== "pec");
    const ventesPec = ventes24h.filter((v) => v.typeVente === "pec");
    const caComptant = ventesCash.reduce((s, v) => s + v.total, 0);
    const valeurPec = ventesPec.reduce((s, v) => s + v.valeurPec, 0);
    const panierMoyen = ventesCash.length > 0 ? caComptant / ventesCash.length : 0;

    // Top produits vendus sur la période (par chiffre d'affaires).
    const idsJour = new Set(ventes24h.map((v) => v.id));
    const parProduit = new Map<string, { ca: number; qte: number }>();
    for (const l of lignes) {
      if (!idsJour.has(l.venteId)) continue;
      const agg = parProduit.get(l.produitId) ?? { ca: 0, qte: 0 };
      agg.ca += l.sousTotal;
      agg.qte += l.quantite;
      parProduit.set(l.produitId, agg);
    }
    const nomProduit = new Map(actifs.map((p) => [p.id, p.designation]));
    const topProduits = [...parProduit.entries()]
      .map(([id, a]) => ({ nom: nomProduit.get(id) ?? id, ...a }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5);

    const fmtAr = (n: number) =>
      new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
      " Ar";
    const dateStr = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // --- HTML (tables simples, compatible clients mail) ---
    const td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px"';
    const th = 'style="padding:6px 10px;border-bottom:2px solid #333;font-size:12px;text-align:left"';
    const rows = (items: string[][]) =>
      items.map((cells) => `<tr>${cells.map((c) => `<td ${td}>${c}</td>`).join("")}</tr>`).join("");

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h1 style="color:#E30613;font-size:20px">Pharmacie — Récapitulatif de fin de journée</h1>
  <p style="color:#666;font-size:13px">${dateStr} · Centre REX, La Vita Per Te</p>

  <h2 style="font-size:15px;margin-top:24px">💰 Activité du jour</h2>
  <table cellspacing="0" style="width:100%">
    ${rows([
      ["Chiffre d'affaires (comptant)", `<strong>${fmtAr(caComptant)}</strong>`],
      ["Ventes comptant", `${ventesCash.length} vente(s) · panier moyen ${fmtAr(panierMoyen)}`],
      ["Prises en charge (0 Ar)", `${ventesPec.length} · valeur ${fmtAr(valeurPec)}`],
      ["Total ventes du jour", String(ventes24h.length)],
    ])}
  </table>

  ${
    topProduits.length === 0
      ? ""
      : `<h2 style="font-size:15px;margin-top:24px">🏆 Top produits vendus</h2>
  <table cellspacing="0" style="width:100%">
    <tr><th ${th}>Produit</th><th ${th}>Qté</th><th ${th}>CA</th></tr>
    ${rows(topProduits.map((p) => [p.nom, String(p.qte), fmtAr(p.ca)]))}
  </table>`
  }

  <h2 style="font-size:15px;margin-top:24px">📦 État du stock</h2>
  <table cellspacing="0" style="width:100%">
    ${rows([
      ["Produits actifs", String(actifs.length)],
      ["Valeur du stock (prix de vente)", fmtAr(valeurStock)],
      ["Produits en rupture", String(actifs.filter((p) => p.stockBase <= 0).length)],
      ["À commander (sous seuil)", String(stockBas.length)],
    ])}
  </table>

  <h2 style="font-size:15px;margin-top:24px">🧾 Ventes du jour</h2>
  ${
    ventes24h.length === 0
      ? '<p style="font-size:13px;color:#666">Aucune vente sur la période.</p>'
      : `<table cellspacing="0" style="width:100%">
          <tr><th ${th}>N°</th><th ${th}>Client</th><th ${th}>Articles</th><th ${th}>Total</th></tr>
          ${rows(ventes24h.map((v) => [v.id, v.clientNom || "—", String(v.nbArticles), fmtAr(v.total)]))}
        </table>`
  }

  <h2 style="font-size:15px;margin-top:24px">⚠️ Alertes</h2>
  ${
    perimes.length === 0 && bientot.length === 0 && stockBas.length === 0
      ? '<p style="font-size:13px;color:#0a7d33">Aucune alerte. ✅</p>'
      : `
    ${
      perimes.length > 0
        ? `<p style="font-size:13px;color:#E30613"><strong>Périmés (${perimes.length})</strong></p>
           <table cellspacing="0" style="width:100%">${rows(perimes.map((p) => [p.designation, p.prochainePeremption ?? "", `stock ${formaterQuantite(p, p.stockBase)}`]))}</table>`
        : ""
    }
    ${
      bientot.length > 0
        ? `<p style="font-size:13px;color:#b45309"><strong>Périment sous 90 jours (${bientot.length})</strong></p>
           <table cellspacing="0" style="width:100%">${rows(bientot.map((p) => [p.designation, p.prochainePeremption ?? "", `J-${p.joursAvantPeremption}`]))}</table>`
        : ""
    }
    ${
      stockBas.length > 0
        ? `<p style="font-size:13px;color:#b45309"><strong>À commander — stock bas (${stockBas.length})</strong></p>
           <table cellspacing="0" style="width:100%">
             <tr><th ${th}>Produit</th><th ${th}>Fournisseur</th><th ${th}>Stock / seuil</th><th ${th}>À commander</th></tr>
             ${rows(
               stockBas
                 .slice()
                 .sort(
                   (a, b) =>
                     (a.fournisseur || "￿").localeCompare(b.fournisseur || "￿") ||
                     a.designation.localeCompare(b.designation),
                 )
                 .map((p) => [
                   p.designation,
                   p.fournisseur || "—",
                   `${formaterQuantite(p, p.stockBase)} / ${formaterQuantite(p, p.stock_min)}`,
                   `<strong>${formaterQuantite(p, Math.max(0, Math.ceil(p.stock_min - p.stockBase)))}</strong>`,
                 ]),
             )}
           </table>`
        : ""
    }`
  }

  <p style="margin-top:28px;font-size:11px;color:#999">
    Récapitulatif automatique de fin de journée — <a href="https://lavitaperteonlus.vercel.app/pharmacie" style="color:#E30613">ouvrir la Pharmacie</a>.
    Destinataires configurables dans Pharmacie → Paramètres.
  </p>
</div>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"Pharmacie — La Vita Per Te" <${gmailUser}>`,
      to: destinataires.join(", "),
      subject: `Pharmacie · Fin de journée ${new Date().toLocaleDateString("fr-FR")} — ${ventes24h.length} vente(s), ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(caComptant)} Ar`,
      html,
    });

    return NextResponse.json({
      ok: true,
      destinataires: destinataires.length,
      ventes24h: ventes24h.length,
      alertes: perimes.length + bientot.length + stockBas.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Rapport impossible : ${String(e).slice(0, 200)}` },
      { status: 500 },
    );
  }
}
