import { describe, it, expect } from "vitest";

import { pickRowIndex } from "./client";

/* Ces tests portent sur la VRAIE fonction utilisée en production, pas sur
   une copie de sa logique. Ils figent la règle qui décide QUELLE LIGNE on
   écrase : une erreur ici sur l'onglet `users` réécrit le mot de passe, le
   rôle et les accès de quelqu'un d'autre. */

const resoudre = (colonneA: unknown[][], id: string) =>
  pickRowIndex(colonneA, id, "users");

/** Un onglet sain : en-tête puis trois utilisateurs. */
const sain = [["id"], ["usr_1"], ["usr_2"], ["usr_3"]];

describe("pickRowIndex — cas nominal", () => {
  it("renvoie le bon numéro de ligne (1-based, en-tête compris)", () => {
    expect(resoudre(sain, "usr_1")).toBe(2);
    expect(resoudre(sain, "usr_3")).toBe(4);
  });
});

describe("pickRowIndex — refus d'écrire", () => {
  it("refuse un identifiant vide AVANT toute résolution", () => {
    // Sans cette garde, indexOf("") tomberait sur la première ligne blanche
    // et on écrirait dedans. C'est le trou que .map() ouvre et que .flat()
    // masquait par accident.
    expect(() => resoudre(sain, "")).toThrow(/vide/);
    expect(() => resoudre(sain, "   ")).toThrow(/vide/);
  });

  it("ne renvoie jamais la ligne d'en-têtes", () => {
    expect(() => resoudre(sain, "id")).toThrow(/introuvable/);
  });

  it("lève sur un identifiant inconnu, au lieu d'écrire ailleurs", () => {
    expect(() => resoudre(sain, "usr_inexistant")).toThrow(/introuvable/);
  });

  it("refuse quand deux lignes portent le même id, en les nommant", () => {
    // Prendre arbitrairement la première reviendrait à modifier un compte
    // au hasard. On s'arrête et on dit lesquelles posent problème.
    const doublon = [["id"], ["usr_1"], ["usr_2"], ["usr_1"]];
    expect(() => resoudre(doublon, "usr_1")).toThrow(/en double.*2.*4/);
  });
});

describe("pickRowIndex — lignes vides au milieu de l'onglet", () => {
  // Le cas que produisait l'ancien deleteSession : une ligne « effacée » en
  // écrivant des chaînes vides par-dessus, au lieu de la retirer.
  const avecTrou = [["id"], ["usr_1"], [], ["usr_3"]];

  it("garde la correspondance index ↔ ligne malgré un trou", () => {
    // .flat() aurait fait disparaître la ligne vide : usr_3 aurait été résolu
    // en ligne 3 au lieu de 4, et l'écriture serait tombée sur la ligne du
    // dessus — donc sur usr_1. .map() préserve les positions.
    expect(resoudre(avecTrou, "usr_3")).toBe(4);
    expect(resoudre(avecTrou, "usr_1")).toBe(2);
  });

  it("n'écrit jamais dans la ligne vide elle-même", () => {
    expect(() => resoudre(avecTrou, "")).toThrow(/vide/);
  });

  it("tolère une ligne absente comme une cellule A vide", () => {
    const creux = [["id"], ["usr_1"], [undefined], ["usr_3"]];
    expect(resoudre(creux, "usr_3")).toBe(4);
  });
});
