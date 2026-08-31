@echo off
rem ============================================================
rem  Cible de la tâche planifiée. Ne pas double-cliquer : ce
rem  fichier ne s'arrête pas pour afficher un résultat, il écrit
rem  dans collecte.log. Pour une collecte à la main, utiliser
rem  collecte.bat, qui attend une touche avant de se fermer.
rem
rem  Il existe parce que schtasks ne sait pas recevoir une
rem  commande contenant « && » : le batch ne connaît pas
rem  l'échappement \" et la chaîne se referme trop tôt, laissant
rem  le « && » nu, pris pour un séparateur de commandes.
rem  L'installeur pointait donc sur une commande que Windows
rem  refusait, et la tâche n'était jamais créée.
rem ============================================================
cd /d "%~dp0"
node collecte.mjs
