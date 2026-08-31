import { describe, expect, it } from "vitest";

import { lirePostes, posteDuSecret } from "./postes";

describe("lecture des postes autorisés", () => {
  it("lit une liste nommée", () => {
    expect(lirePostes("aina:abc123,jim:def456")).toEqual([
      { nom: "aina", secret: "abc123" },
      { nom: "jim", secret: "def456" },
    ]);
  });

  it("accepte encore un secret nu, sans nom", () => {
    /* La configuration en place ne devait pas cesser de fonctionner pendant
       le déploiement du format nommé. */
    expect(lirePostes("abc123")).toEqual([{ nom: "poste", secret: "abc123" }]);
  });

  it("ne tronque pas un secret contenant un deux-points", () => {
    expect(lirePostes("jim:aa:bb:cc")).toEqual([{ nom: "jim", secret: "aa:bb:cc" }]);
  });

  it("tolère espaces, entrées vides et variable absente", () => {
    expect(lirePostes("  aina:abc , , jim:def  ")).toEqual([
      { nom: "aina", secret: "abc" },
      { nom: "jim", secret: "def" },
    ]);
    expect(lirePostes(undefined)).toEqual([]);
    expect(lirePostes("")).toEqual([]);
    expect(lirePostes("nom_sans_secret:")).toEqual([]);
  });
});

describe("reconnaissance du poste", () => {
  const postes = lirePostes("aina:secret-aina,jim:secret-jim");

  it("nomme le poste qui présente le bon secret", () => {
    expect(posteDuSecret("secret-jim", postes)?.nom).toBe("jim");
    expect(posteDuSecret("secret-aina", postes)?.nom).toBe("aina");
  });

  it("refuse un secret inconnu, vide ou seulement préfixe", () => {
    for (const essai of ["", "secret", "secret-jimm", "SECRET-JIM"]) {
      expect(posteDuSecret(essai, postes)).toBeNull();
    }
  });

  it("refuse tout quand aucun poste n'est déclaré", () => {
    expect(posteDuSecret("n'importe quoi", [])).toBeNull();
    expect(posteDuSecret("", [])).toBeNull();
  });
});
