@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  Collecte COMPLETE : toute la memoire de la pointeuse.
echo  A n'utiliser qu'a la premiere installation, ou apres une
echo  coupure de plus d'un mois. La collecte automatique, elle,
echo  n'envoie que les jours recents.
echo ============================================================
echo.
node collecte.mjs --tout
pause
