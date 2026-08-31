@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
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
  echo Recopiez config.exemple.txt en config.txt et completez-le.
  pause
  exit /b 1
)

rem Le nom du poste et les horaires viennent de config.txt : deux postes ne
rem doivent pas collecter a la meme minute, et leurs taches planifiees ne
rem doivent pas porter le meme nom si elles cohabitent un jour.
set "NOM_POSTE=poste"
set "HEURE_DEBUT=06:00"
set "INTERVALLE_MINUTES=60"
set "DUREE=14:00"
for /f "tokens=1,* delims==" %%a in ('findstr /b "NOM_POSTE=" config.txt') do set "NOM_POSTE=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b "HEURE_DEBUT=" config.txt') do set "HEURE_DEBUT=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b "INTERVALLE_MINUTES=" config.txt') do set "INTERVALLE_MINUTES=%%b"
for /f "tokens=1,* delims==" %%a in ('findstr /b "DUREE=" config.txt') do set "DUREE=%%b"

findstr /b "SECRET=" config.txt | findstr /c:"<demander" >nul
if not errorlevel 1 (
  echo [ERREUR] Le SECRET de config.txt n'a pas ete rempli.
  echo Demandez-le au responsable informatique, puis relancez.
  pause
  exit /b 1
)

echo Poste     : !NOM_POSTE!
echo Collecte  : toutes les !INTERVALLE_MINUTES! minutes, des !HEURE_DEBUT!, pendant !DUREE!
echo.

echo [1/4] Installation de la bibliotheque de la pointeuse...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERREUR] npm install a echoue. Verifiez la connexion Internet.
  pause
  exit /b 1
)

rem Une seule tache, declenchee chaque jour a HEURE_DEBUT, qui se REPETE
rem toutes les INTERVALLE_MINUTES pendant DUREE. C'est ce que fait /ri avec
rem /du : plus simple qu'une tache par heure, et modifiable d'un seul geste.
echo [2/4] Creation de la tache horaire...
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage (!NOM_POSTE!)" ^
  /tr "cmd /c cd /d \"%~dp0\" && node collecte.mjs" ^
  /sc daily /st !HEURE_DEBUT! /ri !INTERVALLE_MINUTES! /du !DUREE!
if errorlevel 1 (
  echo [ERREUR] Creation de la tache refusee.
  echo Avez-vous lance ce fichier en tant qu'administrateur ?
  pause
  exit /b 1
)

echo [3/4] Agent du bouton (demarre a chaque ouverture de session)...
schtasks /create /f /tn "LaVitaPerTe - Agent pointage (!NOM_POSTE!)" ^
  /tr "wscript.exe \"%~dp0demarrer-agent.vbs\"" ^
  /sc onlogon
start "" wscript.exe "%~dp0demarrer-agent.vbs"

echo [4/4] Premiere collecte de verification (memoire entiere)...
node collecte.mjs --tout
if errorlevel 1 (
  echo.
  echo [ATTENTION] La collecte de verification a echoue.
  echo La tache est installee, mais quelque chose bloque aujourd'hui :
  echo   - ce poste est-il branche au reseau du centre ?
  echo   - la pointeuse est-elle allumee ?
  echo   - le SECRET de config.txt est-il le bon ?
  echo Le detail est dans collecte.log, a cote de ce fichier.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Termine. Les pointages remontent TOUT SEULS toutes les
echo  !INTERVALLE_MINUTES! minutes, de !HEURE_DEBUT! pendant !DUREE!.
echo  Personne n'a besoin d'ouvrir l'application ni de cliquer.
echo.
echo  Il suffit que ce poste soit allume et branche au reseau
echo  du centre. Journal : collecte.log dans ce dossier.
echo ============================================================
pause
