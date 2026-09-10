@echo off
rem ============================================================
rem  Cible de la tache planifiee. Ne pas double-cliquer : ce
rem  fichier ne s'arrete pas pour afficher un resultat, il ecrit
rem  dans collecte.log. Pour une collecte a la main, utiliser
rem  collecte.bat, qui attend une touche avant de se fermer.
rem
rem  Il existe parce que schtasks ne sait pas recevoir une
rem  commande composee de deux instructions enchainees : le
rem  batch ne connait pas l'echappement des guillemets, la
rem  chaine se referme trop tot, et l'enchainement se retrouve
rem  nu, pris pour un separateur de commandes. L'installeur
rem  pointait donc sur une commande que Windows refusait, et la
rem  tache n'etait jamais creee.
rem
rem  AUCUN CARACTERE SPECIAL DANS CES COMMENTAIRES, et aucun
rem  accent. Un guillemet ouvert dans un rem change l'etat du
rem  parseur de cmd pour la suite du fichier ; les decrire en
rem  toutes lettres coute une phrase et ne risque rien.
rem ============================================================
cd /d "%~dp0"
node collecte.mjs
