import nodemailer from "nodemailer";

/* ============================================================
   COURRIER SORTANT — utilitaire partagé
   ============================================================
   Même transport que les rapports de la pharmacie : SMTP Gmail authentifié
   par GMAIL_USER + GMAIL_APP_PASSWORD (variables Vercel déjà en place).

   L'envoi est TOLÉRANT À L'ÉCHEC par contrat : une notification qui échoue
   ne doit jamais faire échouer l'acte métier qu'elle accompagne — un
   planning soumis reste soumis même si Gmail est injoignable. L'appelant
   reçoit un compte-rendu et décide quoi en dire à l'utilisateur.
   ============================================================ */

export interface EnvoiResultat {
  envoye: boolean;
  detail: string;
}

/**
 * Pièce jointe.
 *
 * Une pièce comptable qui n'existe que derrière un lien se perd le jour où
 * le lien change, où le compte est fermé, ou simplement quand le lecteur
 * n'est pas connecté. Attachée, elle reste dans la boîte tant que la boîte
 * existe, ce que la conservation décennale demande.
 */
export interface PieceJointe {
  nom: string;
  contenu: Buffer;
  type?: string;
}

export async function envoyerMail(options: {
  destinataires: string[];
  sujet: string;
  html: string;
  expediteurLabel?: string;
  piecesJointes?: PieceJointe[];
}): Promise<EnvoiResultat> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return { envoye: false, detail: "SMTP non configuré (GMAIL_USER / GMAIL_APP_PASSWORD)." };
  }
  if (options.destinataires.length === 0) {
    return { envoye: false, detail: "Aucun destinataire." };
  }
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"${options.expediteurLabel ?? "La Vita Per Te"}" <${gmailUser}>`,
      to: options.destinataires.join(", "),
      subject: options.sujet,
      html: options.html,
      attachments: options.piecesJointes?.map((p) => ({
        filename: p.nom,
        content: p.contenu,
        contentType: p.type ?? "application/pdf",
      })),
    });
    const jointes = options.piecesJointes?.length
      ? ` (${options.piecesJointes.map((p) => p.nom).join(", ")})`
      : "";
    return { envoye: true, detail: `Envoyé à ${options.destinataires.join(", ")}${jointes}.` };
  } catch (e) {
    return { envoye: false, detail: String(e).slice(0, 200) };
  }
}
