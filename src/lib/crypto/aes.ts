import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/* ============================================================
   AES-256-GCM — chiffrement des mots de passe matériels
   ============================================================
   Usage :
     const enc = encrypt("l@vit@perte*fi@n@r");
     stockage : { encrypted, iv, tag }
     decrypt(enc) // => "l@vit@perte*fi@n@r"

   La clé est dérivée via scrypt depuis la variable d'env
   `ENCRYPTION_SECRET` + un sel statique. Ne JAMAIS committer
   ENCRYPTION_SECRET : doit vivre dans .env.local / Vercel env.
*/

const SALT = "lavitaperte-rex-2025-salt-v1";
const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ENCRYPTION_SECRET manquant ou trop court (>= 32 chars requis). Ajoutez-le dans .env.local",
    );
  }
  return scryptSync(secret, SALT, KEY_LENGTH);
}

export interface EncryptedPayload {
  encrypted: string; // base64
  iv: string;        // base64
  tag: string;       // base64
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const encrypted = Buffer.from(payload.encrypted, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Utilitaire pour générer un `ENCRYPTION_SECRET` fort (à exécuter une seule fois). */
export function generateSecret(): string {
  return randomBytes(48).toString("base64");
}
