/**
 * CORRECTIF node-zklib — lecture complète de la mémoire de la pointeuse.
 *
 * ── LE DÉFAUT ────────────────────────────────────────────────────────────
 * Pour lire la mémoire, la bibliothèque la découpe en blocs de 65 472 octets
 * et n'accepte un bloc que lorsqu'il est reçu EN ENTIER (zklibtcp.js,
 * readWithBuffer). Le dernier bloc, lui, est presque toujours partiel — la
 * mémoire tombe rarement sur un multiple exact. Quand le délai de réception
 * expire, ce bloc partiel déjà reçu est PURENENT ET SIMPLEMENT JETÉ : la
 * fonction rend les blocs complets et une erreur… que getAttendances ne
 * propage pas. L'appelant croit donc avoir tout lu.
 *
 * ── POURQUOI C'EST GRAVE ICI ─────────────────────────────────────────────
 * La mémoire se lit du plus ancien au plus récent : ce qui est jeté est
 * toujours LA FIN, c'est-à-dire les journées en cours.
 *
 * Mesuré sur la pointeuse du site REX (13 285 passages en mémoire, 40 octets
 * chacun) :
 *   • 65 472 / 40        = 1 636,8 passages par bloc
 *   • 8 blocs complets   = 13 094 passages  → lus, systématiquement
 *   • reliquat           =    191 passages  → jetés, systématiquement
 * Ces 191 passages étaient exactement le 28 et le 29 juillet. Douze essais
 * n'ont jamais dépassé 13 094 : le défaut est structurel, pas intermittent.
 *
 * ── LE CORRECTIF ─────────────────────────────────────────────────────────
 * À l'expiration du délai, on CONSERVE le bloc partiel au lieu de le jeter.
 * Rien d'autre ne change : même découpage, même décodage, même protocole.
 * L'appelant reste chargé de vérifier que le total lu rejoint le compteur
 * annoncé par l'appareil — un correctif ne dispense pas d'un garde-fou.
 *
 * Cette réimplémentation vit dans notre dépôt plutôt que dans une copie
 * modifiée du paquet : elle survit à une réinstallation des dépendances, et
 * la raison du changement reste lisible à côté du code qui en dépend.
 *
 * À importer AVANT le premier `new ZKLib(...)`.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ZKLibTCP = require("node-zklib/zklibtcp.js");
const { MAX_CHUNK, COMMANDS } = require("node-zklib/constants.js");
const { decodeTCPHeader, checkNotEventTCP } = require("node-zklib/utils.js");

/** Délai d'attente entre deux paquets, en millisecondes. */
const DELAI_PAQUET_MS = 15000;

ZKLibTCP.prototype.readWithBuffer = function readWithBufferComplet(reqData, cb = null) {
  return new Promise(async (resolve, reject) => {
    this.replyId++;
    const buf = require("node-zklib/utils.js").createTCPHeader(
      COMMANDS.CMD_DATA_WRRQ,
      this.sessionId,
      this.replyId,
      reqData,
    );

    let reply = null;
    try {
      reply = await this.requestData(buf);
    } catch (err) {
      return reject(err);
    }

    const header = decodeTCPHeader(reply.subarray(0, 16));
    switch (header.commandId) {
      case COMMANDS.CMD_DATA: {
        // Mémoire assez petite pour tenir dans une seule réponse : aucun
        // découpage, donc aucun risque de reliquat perdu.
        resolve({ data: reply.subarray(16), mode: 8 });
        break;
      }
      case COMMANDS.CMD_ACK_OK:
      case COMMANDS.CMD_PREPARE_DATA: {
        const recvData = reply.subarray(16);
        const size = recvData.readUIntLE(1, 4);

        const remain = size % MAX_CHUNK;
        const numberChunks = Math.round(size - remain) / MAX_CHUNK;
        let totalPackets = numberChunks + (remain > 0 ? 1 : 0);

        let replyData = Buffer.from([]);
        let totalBuffer = Buffer.from([]);
        let realTotalBuffer = Buffer.from([]);
        let termine = false;

        const finir = (err = null) => {
          if (termine) return;
          termine = true;
          timer && clearTimeout(timer);
          this.socket && this.socket.removeListener("data", handleOnData);
          resolve({ data: replyData, err });
        };

        /**
         * Abandon sur délai — LA correction.
         *
         * L'implémentation d'origine rendait `replyData` seul, laissant
         * `realTotalBuffer` (le bloc partiel en cours, soit la fin de la
         * mémoire) se perdre. On le rattache avant de rendre la main : les
         * données sont là, reçues et valides, seul leur compte n'atteint
         * pas la taille d'un bloc plein.
         */
        const abandonner = () => {
          if (realTotalBuffer.length > 8) {
            replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)]);
            realTotalBuffer = Buffer.from([]);
          }
          finir(new Error(`Délai dépassé — ${totalPackets} bloc(s) restant(s)`));
        };

        let timer = setTimeout(abandonner, DELAI_PAQUET_MS);

        const handleOnData = (reponse) => {
          if (checkNotEventTCP(reponse)) return;
          clearTimeout(timer);
          timer = setTimeout(abandonner, DELAI_PAQUET_MS);

          totalBuffer = Buffer.concat([totalBuffer, reponse]);
          const packetLength = totalBuffer.readUIntLE(4, 2);
          if (totalBuffer.length < 8 + packetLength) return;

          realTotalBuffer = Buffer.concat([
            realTotalBuffer,
            totalBuffer.subarray(16, 8 + packetLength),
          ]);
          totalBuffer = totalBuffer.subarray(8 + packetLength);

          const blocPlein = totalPackets > 1 && realTotalBuffer.length === MAX_CHUNK + 8;
          const blocFinal = totalPackets === 1 && realTotalBuffer.length === remain + 8;
          if (!blocPlein && !blocFinal) return;

          replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)]);
          totalBuffer = Buffer.from([]);
          realTotalBuffer = Buffer.from([]);
          totalPackets -= 1;
          cb && cb(replyData.length, size);

          if (totalPackets <= 0) finir();
        };

        this.socket.once("close", () => {
          // Fermeture inattendue : on garde là aussi ce qui a été reçu.
          if (realTotalBuffer.length > 8) {
            replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)]);
          }
          finir(new Error("Connexion fermée par l'appareil"));
        });
        this.socket.on("data", handleOnData);

        for (let i = 0; i <= numberChunks; i++) {
          if (i === numberChunks) this.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
          else this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
        }
        break;
      }
      default:
        reject(new Error(`Commande inattendue : ${header.commandId}`));
    }
  });
};

export const CORRECTIF_ZK_APPLIQUE = true;
