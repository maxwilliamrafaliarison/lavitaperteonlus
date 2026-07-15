# Droits des patientes — procédure

**Mise à jour** : 15 juillet 2026

Une patiente peut demander l'accès à ses données, leur rectification, leur
effacement ou leur portabilité (RGPD art. 15 à 20). **Le RGPD impose une
réponse sous un mois** (art. 12.3).

> **Pourquoi une procédure papier plutôt qu'un portail.** Construire un
> espace patient sécurisé pour 139 928 personnes, avec un seul développeur
> et aucune astreinte, créerait plus de risques qu'il n'en résout : un
> portail mal fait est une porte d'entrée vers des dossiers de santé. Le
> RGPD n'impose aucun canal en ligne — il impose de **répondre**. Quelques
> demandes par an se traitent très bien à la main.

---

## Qui reçoit la demande

La patiente s'adresse **à l'accueil du centre**, oralement ou par écrit.
L'accueil transmet à la direction (`direction.lavitaperte@gmail.com`), qui
tient le registre des demandes ci-dessous.

---

## Vérifier l'identité — l'étape à ne jamais sauter

**Remettre un dossier de santé à la mauvaise personne est une violation de
données**, aussi grave qu'une fuite. Un mari, un parent, un employeur
peuvent se présenter à la place de la patiente.

Exiger : **présentation physique au centre avec une pièce d'identité**, et
concordance avec le nom et la date de naissance du dossier.

En cas de doute, ne rien remettre et en référer à la direction. Un refus
motivé est toujours préférable à une remise hâtive.

---

## Traiter chaque type de demande

### Accès (art. 15) — « je veux voir mon dossier »

1. Vérifier l'identité (ci-dessus).
2. Retrouver le numéro de patiente dans l'application (`/patients`).
3. Imprimer les visites, ou les recopier sur un document remis en main propre.
4. La patiente peut aussi demander **qui a consulté son dossier** — c'est
   son droit. Cette liste s'extrait du journal (demander au développeur) :

   ```sql
   select ts, user_email, action
     from patients.acces_log
    where n_patiente = 'R352'
    order by ts desc;
   ```

5. Consigner la demande dans le registre ci-dessous.

### Rectification (art. 16) — « cette donnée est fausse »

L'application est en **lecture seule** : elle ne peut rien corriger.
Noter la demande, la transmettre au développeur, qui corrigera en base et
consignera la modification. Prévenir la patiente une fois fait.

### Effacement (art. 17) — « supprimez mon dossier »

⚠️ **Ce droit n'est pas absolu**, et il ne s'applique probablement pas ici :
l'article 17.3.b et 17.3.c prévoit des exceptions pour les obligations
légales et les motifs d'intérêt public en santé publique. Un dossier médical
ne s'efface généralement pas sur demande avant sa durée légale de
conservation.

**Ne jamais refuser sans expliquer.** Transmettre à la direction, qui répond
par écrit en motivant, et informe la patiente de son droit de réclamation
auprès d'une autorité de contrôle.

### Portabilité (art. 20) — « donnez-moi mes données »

Ne s'applique **pas** ici : la portabilité suppose un traitement fondé sur le
consentement ou un contrat (art. 20.1.a). Notre base légale est l'art. 9.2.h
(soins). Répondre par écrit en le motivant, et proposer l'accès (art. 15),
qui couvre le besoin réel dans presque tous les cas.

---

## Registre des demandes

À tenir même s'il reste vide : il démontre que la procédure existe (art. 5.2).

| Date | Patiente (n°) | Nature | Identité vérifiée | Réponse le | Par |
|---|---|---|---|---|---|
| | | | | | |

---

## En cas de violation de données

Une violation, c'est aussi bien une fuite qu'une **perte** ou une
**divulgation à la mauvaise personne**.

1. **Notifier l'autorité de contrôle sous 72 h** (art. 33) — le délai court
   à partir du moment où l'on en a connaissance, pas de la résolution.
2. Si le risque est élevé pour les personnes, **les informer** (art. 34).
3. Consigner : quoi, quand, combien de personnes, quelles mesures.

Le journal des accès est l'outil qui permet d'instruire : il dit qui a
consulté quoi, et quand.
