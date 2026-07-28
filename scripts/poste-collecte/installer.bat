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

echo [1/4] Installation de la bibliotheque de la pointeuse...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERREUR] npm install a echoue. Verifiez la connexion Internet.
  pause
  exit /b 1
)

echo [2/4] Creation des taches planifiees (9h00 et 15h00)...
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage matin" ^
  /tr "cmd /c cd /d \"%~dp0\" && node collecte.mjs" ^
  /sc daily /st 09:00
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage apres-midi" ^
  /tr "cmd /c cd /d \"%~dp0\" && node collecte.mjs" ^
  /sc daily /st 15:00

echo [3/4] Agent du bouton (demarre a chaque ouverture de session)...
schtasks /create /f /tn "LaVitaPerTe - Agent pointage" ^
  /tr "wscript.exe \"%~dp0demarrer-agent.vbs\"" ^
  /sc onlogon
start "" wscript.exe "%~dp0demarrer-agent.vbs"

echo [4/4] Premiere collecte de verification...
node collecte.mjs

echo.
echo ============================================================
echo  Termine. Les pointages remontent chaque jour a 9h00 et
echo  15h00, et le bouton "Recuperer les pointages" de
echo  l'application fonctionne depuis ce poste.
echo  Journal : collecte.log dans ce dossier.
echo ============================================================
pause
