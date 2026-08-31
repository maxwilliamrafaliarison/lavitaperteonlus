import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getUserByEmail } from "@/lib/sheets/users";
import {
  listProduitsAvecStock,
  listVentes,
  listLignesVente,
  listParametres,
} from "@/lib/pharmacie/sheets";
import { formaterQuantite, prixParUniteBase } from "@/lib/pharmacie/fractionnement";
import { chargerEntite } from "@/lib/pharmacie/entite";
import { htmlRapportQuotidien } from "@/lib/pharmacie/rapport-quotidien-html";

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
 *
 * `?apercu=<adresse>` envoie le même récapitulatif à cette seule adresse,
 * pour voir le modèle sans écrire à toute la liste.
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

    /* APERÇU — voir le modèle sans écrire à toute la liste.
       L'adresse doit être celle d'un COMPTE ACTIF de l'application :
       sans ce garde-fou, la route deviendrait un relais ouvert pour qui
       détient le secret du cron ou une session pharmacie. */
    const apercu = req.nextUrl.searchParams.get("apercu")?.trim().toLowerCase() ?? "";
    let envoiA = destinataires;
    if (apercu) {
      const compte = await getUserByEmail(apercu).catch(() => null);
      if (!compte?.active) {
        return NextResponse.json(
          { error: "Aperçu refusé : cette adresse n'est pas celle d'un compte actif." },
          { status: 400 },
        );
      }
      envoiA = [compte.email];
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

    const dateStr = new Date().toLocaleDateString("fr-FR", {
      timeZone: "Indian/Antananarivo",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    /* Les quantités sont mises en forme ICI, où l'on dispose du produit
       complet et de ses règles de fractionnement. Le module de composition
       ne reçoit que du texte : il met en page, il ne calcule pas. */
    const enProduit = (p: (typeof actifs)[number]) => ({
      designation: p.designation,
      fournisseur: p.fournisseur,
      prochainePeremption: p.prochainePeremption,
      joursAvantPeremption: p.joursAvantPeremption,
      stockAffiche: formaterQuantite(p, p.stockBase),
      seuilAffiche: formaterQuantite(p, p.stock_min),
      aCommander: formaterQuantite(p, Math.max(0, Math.ceil(p.stock_min - p.stockBase))),
    });

    const html = htmlRapportQuotidien({
      entite: await chargerEntite("REX"),
      dateStr,
      apercu: Boolean(apercu),
      destinataires,
      caComptant,
      panierMoyen,
      valeurPec,
      nbVentes: ventes24h.length,
      nbVentesComptant: ventesCash.length,
      nbPec: ventesPec.length,
      ventes: ventes24h.map((v) => ({
        id: v.id,
        clientNom: v.clientNom || "",
        nbArticles: v.nbArticles,
        total: v.total,
      })),
      topProduits,
      nbActifs: actifs.length,
      valeurStock,
      enRupture: actifs.filter((p) => p.stockBase <= 0).length,
      perimes: perimes.map(enProduit),
      bientot: bientot.map(enProduit),
      stockBas: stockBas.map(enProduit),
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"Pharmacie · La Vita Per Te" <${gmailUser}>`,
      to: envoiA.join(", "),
      subject: `${apercu ? "[Aperçu] " : ""}Pharmacie · Fin de journée ${new Date().toLocaleDateString("fr-FR")} : ${ventes24h.length} vente(s), ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(caComptant)} Ar`,
      html,
    });

    return NextResponse.json({
      ok: true,
      apercu: apercu || undefined,
      destinataires: envoiA.length,
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
