@echo off
chcp 65001 >nul
echo ============================================================
echo  Installation de la collecte automatique des pointages
echo  La Vita Per Te - Centre REX
echo ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe sur ce poste.
  echo Telechargez la version LTS sur https://nodejs.org puis relancez.
  pause
  exit /b 1
)

if not exist config.txt (
  echo [ERREUR] config.txt est absent de ce dossier.
  pause
  exit /b 1
)

echo [1/3] Installation de la bibliotheque de la pointeuse...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERREUR] npm install a echoue. Verifiez la connexion Internet.
  pause
  exit /b 1
)

echo [2/3] Creation des taches planifiees (12h15 et 17h45)...
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage midi" ^
  /tr "cmd /c cd /d \"%~dp0\" && node collecte.mjs" ^
  /sc daily /st 12:15
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage soir" ^
  /tr "cmd /c cd /d \"%~dp0\" && node collecte.mjs" ^
  /sc daily /st 17:45

echo [3/3] Premiere collecte de verification...
node collecte.mjs

echo.
echo ============================================================
echo  Termine. Les pointages remonteront chaque jour a 12h15
echo  et 17h45, tant que ce poste est allume et sur le reseau.
echo  Journal : collecte.log dans ce dossier.
echo ============================================================
pause
