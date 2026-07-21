import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  listProduitsAvecStock,
  listParametres,
} from "@/lib/pharmacie/sheets";
import { formaterQuantite, prixParUniteBase } from "@/lib/pharmacie/fractionnement";
import { buildRapportData, type VentesData } from "@/lib/pharmacie/reports/data";
import { buildBilanMensuel } from "@/lib/pharmacie/reports/bilan";
import { renderBilanMensuel } from "@/lib/pharmacie/reports/bilan-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const fmtAr = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " Ar";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

/**
 * GET /api/pharmacie/rapport-mensuel
 *
 * Rapport MENSUEL par email — déclenché le 1er du mois par le cron Vercel,
 * il couvre le MOIS ÉCOULÉ (le mois précédent, complet). Résume les ventes
 * comptant / prises en charge, la valeur du stock et les alertes, et joint
 * le PDF détaillé des ventes du mois (pour la comptabilité).
 *
 * Sécurité : Authorization: Bearer <CRON_SECRET> (cron) OU session
 * admin/pharmacien. SMTP Gmail. Destinataires : paramètre
 * email_rapports_destinataires.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user || !can(session.user.role, "pharmacie:stock")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "SMTP non configuré : GMAIL_USER et GMAIL_APP_PASSWORD requis." },
      { status: 503 },
    );
  }

  try {
    // Mois écoulé : du 1er au dernier jour du mois précédent.
    const now = new Date();
    const debut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fin = new Date(now.getFullYear(), now.getMonth(), 0); // jour 0 = dernier du mois préc.
    const from = debut.toISOString().slice(0, 10);
    const to = fin.toISOString().slice(0, 10);
    const moisLabel = debut.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const [ventes, produits, params] = await Promise.all([
      buildRapportData("ventes", { from, to }) as Promise<VentesData>,
      listProduitsAvecStock(),
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

    const actifs = produits.filter((p) => p.statut === "actif");
    const valeurStock = actifs.reduce(
      (s, p) => s + p.stockBase * prixParUniteBase(p),
      0,
    );
    const aCommander = actifs.filter(
      (p) => p.stock_min > 0 && p.stockBase <= p.stock_min,
    );
    const ruptures = actifs.filter((p) => p.stockBase <= 0);
    const perimes = actifs.filter(
      (p) => p.joursAvantPeremption !== null && p.joursAvantPeremption < 0,
    );

    const td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px"';
    const rows = (items: string[][]) =>
      items.map((c) => `<tr>${c.map((x) => `<td ${td}>${x}</td>`).join("")}</tr>`).join("");

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h1 style="color:#E30613;font-size:20px">Pharmacie — Rapport mensuel</h1>
  <p style="color:#666;font-size:13px">${moisLabel} · Centre REX, La Vita Per Te</p>

  <h2 style="font-size:15px;margin-top:24px">💰 Ventes du mois</h2>
  <table cellspacing="0" style="width:100%">
    ${rows([
      ["Ventes comptant", `${ventes.cash.length} · <strong>${fmtAr(ventes.totalCash)}</strong> encaissés`],
      ["Prises en charge (0 Ar)", `${ventes.pec.length} · ${fmtAr(ventes.valeurPec)} de valeur`],
      ["Total ventes", String(ventes.cash.length + ventes.pec.length)],
    ])}
  </table>

  <h2 style="font-size:15px;margin-top:24px">📦 Stock en fin de mois</h2>
  <table cellspacing="0" style="width:100%">
    ${rows([
      ["Produits actifs", String(actifs.length)],
      ["Valeur du stock", fmtAr(valeurStock)],
      ["À commander (sous seuil)", String(aCommander.length)],
      ["En rupture", String(ruptures.length)],
      ["Périmés", String(perimes.length)],
    ])}
  </table>

  ${
    aCommander.length > 0
      ? `<h2 style="font-size:15px;margin-top:24px">🛒 À commander (${aCommander.length})</h2>
         <table cellspacing="0" style="width:100%">
           ${rows(
             aCommander
               .slice()
               .sort(
                 (a, b) =>
                   (a.fournisseur || "￿").localeCompare(b.fournisseur || "￿") ||
                   a.designation.localeCompare(b.designation),
               )
               .slice(0, 40)
               .map((p) => [
                 p.designation,
                 p.fournisseur || "—",
                 `<strong>${formaterQuantite(p, Math.max(0, Math.ceil(p.stock_min - p.stockBase)))}</strong>`,
               ]),
           )}
         </table>`
      : ""
  }

  <p style="margin-top:28px;font-size:11px;color:#999">
    Bilan mensuel automatique du mois écoulé. Le document de gestion complet
    (activité, marge, stock, prises en charge, fiche détaillée) est joint en PDF.
    <a href="https://lavitaperteonlus.vercel.app/pharmacie/rapports" style="color:#E30613">Ouvrir les rapports</a>.
  </p>
</div>`;

    // Bilan mensuel complet (document de gestion pluri-sections) en pièce
    // jointe à la Direction — l'objet même du rapport mensuel.
    const bilan = await buildBilanMensuel(from, to);
    const pdfBilan = await streamToBuffer(
      await renderBilanMensuel(bilan, {
        lang: "fr",
        generatedBy: "Rapport automatique",
        generatedAt: new Date().toISOString(),
      }),
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"Pharmacie — La Vita Per Te" <${gmailUser}>`,
      to: destinataires.join(", "),
      subject: `Pharmacie · Bilan mensuel ${moisLabel} — ${fmtAr(ventes.totalCash)} encaissés, marge ${bilan.tauxMarge.toFixed(0)} %`,
      html,
      attachments: [
        { filename: `bilan-mensuel-${from.slice(0, 7)}.pdf`, content: pdfBilan, contentType: "application/pdf" },
      ],
    });

    return NextResponse.json({
      ok: true,
      mois: moisLabel,
      destinataires: destinataires.length,
      ventesCash: ventes.cash.length,
      ventesPec: ventes.pec.length,
      totalCash: ventes.totalCash,
      aCommander: aCommander.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Rapport mensuel impossible : ${String(e).slice(0, 200)}` },
      { status: 500 },
    );
  }
}
