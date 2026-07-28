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

export async function envoyerMail(options: {
  destinataires: string[];
  sujet: string;
  html: string;
  expediteurLabel?: string;
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
    });
    return { envoye: true, detail: `Envoyé à ${options.destinataires.join(", ")}.` };
  } catch (e) {
    return { envoye: false, detail: String(e).slice(0, 200) };
  }
}
