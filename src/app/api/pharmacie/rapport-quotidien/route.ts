import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  listProduitsAvecStock,
  listVentes,
  listParametres,
} from "@/lib/pharmacie/sheets";

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
    const [produits, ventes, params] = await Promise.all([
      listProduitsAvecStock(),
      listVentes(),
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
    const valeurStock = actifs.reduce(
      (s, p) => s + p.stock * (p.prix_vente || 0),
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
      (p) => p.stock_min > 0 && p.stock <= p.stock_min,
    );

    const depuis = Date.now() - 24 * 3600 * 1000;
    const ventes24h = ventes.filter(
      (v) => new Date(v.timestamp).getTime() >= depuis && v.statut !== "annulee",
    );
    const ca24h = ventes24h.reduce((s, v) => s + v.total, 0);

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
  <h1 style="color:#E30613;font-size:20px">Pharmacie — Rapport quotidien</h1>
  <p style="color:#666;font-size:13px">${dateStr} · Centre REX, La Vita Per Te</p>

  <h2 style="font-size:15px;margin-top:24px">📊 État du stock</h2>
  <table cellspacing="0" style="width:100%">
    ${rows([
      ["Produits actifs", String(actifs.length)],
      ["Valeur du stock (prix de vente)", fmtAr(valeurStock)],
      ["Ventes des dernières 24 h", `${ventes24h.length} vente(s) · ${fmtAr(ca24h)}`],
    ])}
  </table>

  <h2 style="font-size:15px;margin-top:24px">🧾 Ventes des dernières 24 h</h2>
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
           <table cellspacing="0" style="width:100%">${rows(perimes.map((p) => [p.designation, p.prochainePeremption ?? "", `stock ${p.stock}`]))}</table>`
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
        ? `<p style="font-size:13px;color:#b45309"><strong>Stock bas (${stockBas.length})</strong></p>
           <table cellspacing="0" style="width:100%">${rows(stockBas.map((p) => [p.designation, `stock ${p.stock}`, `min ${p.stock_min}`]))}</table>`
        : ""
    }`
  }

  <p style="margin-top:28px;font-size:11px;color:#999">
    Rapport automatique — <a href="https://lavitaperteonlus.vercel.app/pharmacie" style="color:#E30613">ouvrir la Pharmacie</a>.
    Destinataires configurables dans l'onglet parametres du classeur Pharmacie.
  </p>
</div>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"Pharmacie — La Vita Per Te" <${gmailUser}>`,
      to: destinataires.join(", "),
      subject: `Pharmacie · Rapport du ${new Date().toLocaleDateString("fr-FR")} — ${actifs.length} produits, ${ventes24h.length} vente(s)`,
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
