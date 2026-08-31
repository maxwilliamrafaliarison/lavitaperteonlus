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
 * ── LE CORRECTIF, PREMIÈRE VERSION ──────────────────────────────────────
 * À l'expiration du délai, on CONSERVAIT le bloc partiel au lieu de le
 * jeter. Cela a suffi tant que la mémoire tenait en huit blocs.
 *
 * ── CE QUI A CESSÉ DE SUFFIRE ────────────────────────────────────────────
 * La bibliothèque envoie toutes les requêtes de blocs D'UN SEUL COUP, puis
 * écoute. À 15 259 passages, la mémoire en demande DIX, et la salve dépasse
 * ce que l'appareil ou le réseau encaissent. Mesuré le 31 août sur le poste
 * d'Aina, six essais d'affilée :
 *   • annoncés   : 15 259 passages (610 360 octets, 9 blocs pleins + 21 112)
 *   • lus        : 14 940, soit 9,13 blocs ; ou 14 446, soit 8,83 blocs
 *   • jamais dix.
 *
 * Et un bloc manquant ne retranche pas seulement des passages : il DÉCALE
 * le décodage de tout ce qui suit. La lecture ressort alors en passages
 * aberrants plutôt qu'en passages absents, ce que l'agent voyait sous la
 * forme « 0 sur 15 259 » après avoir tout rejeté.
 *
 * ── LE CORRECTIF, VERSION EN VIGUEUR ─────────────────────────────────────
 * Un bloc à la fois : on demande, on attend sa fin, on demande le suivant.
 * Chaque bloc est réclamé jusqu'à trois fois avant qu'on renonce. La lecture
 * prend quelques secondes de plus et cesse de dépendre de la taille de la
 * mémoire, qui ne fera que croître.
 *
 * L'appelant reste chargé de vérifier que le total lu rejoint le compteur
 * annoncé par l'appareil : un correctif ne dispense pas d'un garde-fou.
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

/** Reprises d'un même bloc avant d'abandonner. */
const REPRISES = 3;

/**
 * Lecture d'UN bloc, et attente de sa fin avant de demander le suivant.
 *
 * ── POURQUOI SÉQUENTIEL ─────────────────────────────────────────────────
 * L'implémentation d'origine envoie toutes les requêtes de blocs D'UN COUP,
 * puis écoute. Tant que la mémoire tenait en huit blocs, la pointeuse de REX
 * suivait. À 15 259 passages elle en demande DIX, et la salve dépasse ce que
 * l'appareil ou le réseau encaissent : les lectures se sont mises à rendre
 * 9,13 puis 8,83 blocs, jamais dix. Six essais d'affilée, toujours court.
 *
 * Pire qu'incomplet : un bloc manquant DÉCALE le décodage de tout ce qui
 * suit, et la lecture ressort en passages aberrants plutôt qu'en passages
 * absents. C'est ce que voyait l'agent, qui les rejetait tous.
 *
 * Un bloc à la fois, donc, chacun réclamé à nouveau jusqu'à trois fois. La
 * lecture est plus lente, de quelques secondes ; elle a l'avantage d'aboutir.
 */
function lireBloc(zk, offset, taille) {
  return new Promise((resolve, reject) => {
    let recu = Buffer.from([]);
    let tampon = Buffer.from([]);
    let fini = false;
    let timer = null;

    const terminer = (err, data) => {
      if (fini) return;
      fini = true;
      clearTimeout(timer);
      zk.socket.removeListener("data", surDonnees);
      err ? reject(err) : resolve(data);
    };
    const relancerDelai = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => terminer(new Error(`bloc à ${offset} : silence de ${DELAI_PAQUET_MS} ms`)),
        DELAI_PAQUET_MS,
      );
    };

    function surDonnees(reponse) {
      if (checkNotEventTCP(reponse)) return;
      relancerDelai();
      tampon = Buffer.concat([tampon, reponse]);
      /* Un paquet peut en contenir plusieurs, ou arriver coupé : on vide le
         tampon tant qu'il porte un paquet entier, au lieu d'en traiter un
         seul par événement. */
      while (tampon.length >= 8) {
        const longueur = tampon.readUIntLE(4, 2);
        if (tampon.length < 8 + longueur) break;
        recu = Buffer.concat([recu, tampon.subarray(16, 8 + longueur)]);
        tampon = tampon.subarray(8 + longueur);
      }
      // Les huit premiers octets du bloc sont un en-tête, pas des données.
      if (recu.length >= taille + 8) terminer(null, recu.subarray(8, taille + 8));
    }

    zk.socket.on("data", surDonnees);
    relancerDelai();
    try {
      zk.sendChunkRequest(offset, taille);
    } catch (e) {
      terminer(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

ZKLibTCP.prototype.readWithBuffer = async function readWithBufferSequentiel(reqData, cb = null) {
  this.replyId++;
  const buf = require("node-zklib/utils.js").createTCPHeader(
    COMMANDS.CMD_DATA_WRRQ,
    this.sessionId,
    this.replyId,
    reqData,
  );
  const reply = await this.requestData(buf);
  const header = decodeTCPHeader(reply.subarray(0, 16));

  // Mémoire assez petite pour tenir dans une seule réponse : rien à découper.
  if (header.commandId === COMMANDS.CMD_DATA) {
    return { data: reply.subarray(16), mode: 8 };
  }
  if (header.commandId !== COMMANDS.CMD_ACK_OK && header.commandId !== COMMANDS.CMD_PREPARE_DATA) {
    throw new Error(`Commande inattendue : ${header.commandId}`);
  }

  const size = reply.subarray(16).readUIntLE(1, 4);
  const remain = size % MAX_CHUNK;
  const blocsPleins = (size - remain) / MAX_CHUNK;

  let donnees = Buffer.from([]);
  let erreur = null;
  for (let i = 0; i <= blocsPleins; i++) {
    const offset = i * MAX_CHUNK;
    const taille = i === blocsPleins ? remain : MAX_CHUNK;
    if (taille === 0) break;

    let bloc = null;
    for (let essai = 1; essai <= REPRISES && !bloc; essai++) {
      try {
        bloc = await lireBloc(this, offset, taille);
      } catch (e) {
        /* Dernière reprise épuisée : on rend ce qu'on a. Le bloc manquant
           est signalé à l'appelant, à qui il revient de refuser une lecture
           dont il sait qu'elle est trouée. */
        if (essai === REPRISES) erreur = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (!bloc) break;
    donnees = Buffer.concat([donnees, bloc]);
    cb && cb(donnees.length, size);
  }

  return { data: donnees, err: erreur };
};

export const CORRECTIF_ZK_APPLIQUE = true;
