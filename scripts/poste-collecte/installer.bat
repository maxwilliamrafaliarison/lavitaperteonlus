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

rem Une espace dans le chemin casserait les commandes des taches planifiees,
rem ou l'installeur devrait imbriquer des guillemets — ce qui est
rem precisement ce qui vient de faire echouer la creation de la tache. On
rem impose donc un chemin simple, et on le dit tout de suite.
echo "%~dp0" | findstr /c:" " >nul
if not errorlevel 1 (
  echo [ERREUR] Le chemin de ce dossier contient une espace :
  echo    %~dp0
  echo.
  echo Deplacez-le vers  C:\LaVitaPerTe\Collecte-pointage\  puis relancez.
  pause
  exit /b 1
)

rem Un dossier synchronise par OneDrive finit par casser la collecte, et
rem toujours en silence : les milliers de fichiers de node_modules partent
rem en synchronisation, les fichiers "a la demande" deviennent des liens
rem vides que Node ne sait pas lire a six heures du matin, et deux postes
rem sur un meme compte s'echangent leurs config.txt. On refuse plutot que
rem de laisser la panne arriver dans trois mois sans cause visible.
echo "%~dp0" | findstr /i "OneDrive" >nul
if not errorlevel 1 (
  echo [ERREUR] Ce dossier est dans OneDrive :
  echo    %~dp0
  echo.
  echo La collecte s'arreterait tot ou tard, sans message d'erreur.
  echo Deplacez ce dossier vers  C:\LaVitaPerTe\Collecte-pointage\
  echo puis relancez installer.bat depuis la.
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

echo [1/5] Installation de la bibliotheque de la pointeuse...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERREUR] npm install a echoue. Verifiez la connexion Internet.
  pause
  exit /b 1
)

rem Les taches de l'ancienne version (deux collectes par jour, sans nom de
rem poste) portent d'autres noms : les nouvelles ne les remplacent donc pas,
rem et elles continueraient de s'executer avec l'ancien secret, echouant
rem chaque jour en remplissant le journal. On les retire d'abord.
echo [2/5] Retrait des anciennes taches, s'il y en a...
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage matin" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage apres-midi" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Agent pointage" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage matin (!NOM_POSTE!)" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage apres-midi (!NOM_POSTE!)" 2>nul

rem Une seule tache, declenchee chaque jour a HEURE_DEBUT, qui se REPETE
rem toutes les INTERVALLE_MINUTES pendant DUREE. C'est ce que fait /ri avec
rem /du : plus simple qu'une tache par heure, et modifiable d'un seul geste.
echo [3/5] Creation de la tache horaire...
rem UN SEUL CHEMIN, ENTRE UNE SEULE PAIRE DE GUILLEMETS.
rem La version d'origine passait « cmd /c cd /d \"%~dp0\" && node
rem collecte.mjs » : cmd coupait la ligne au « && » avant meme d'appeler
rem schtasks, car le batch ne connait pas l'echappement \". La tache
rem n'etait jamais creee, et l'installeur poursuivait comme si de rien.
rem
rem On vise donc un fichier, sans commande composee ET sans guillemets
rem imbriques. collecte-tache.bat se place lui-meme dans son dossier, et
rem collecte.mjs lit sa configuration a cote de lui : rien ne depend du
rem repertoire courant de la tache.
schtasks /create /f /tn "LaVitaPerTe - Collecte pointage (!NOM_POSTE!)" ^
  /tr "%~dp0collecte-tache.bat" ^
  /sc daily /st !HEURE_DEBUT! /ri !INTERVALLE_MINUTES! /du !DUREE!
if errorlevel 1 (
  echo [ERREUR] Creation de la tache refusee.
  echo Avez-vous lance ce fichier en tant qu'administrateur ?
  pause
  exit /b 1
)
rem On RELIT la tache creee. Un installeur qui annonce avoir installe sans
rem verifier laisse croire que tout va bien pendant des jours : c'est ce
rem qui vient d'arriver, la tache n'existant pas malgre l'ecran final.
schtasks /query /tn "LaVitaPerTe - Collecte pointage (!NOM_POSTE!)" >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] La tache n'existe pas apres creation. Rien ne se declenchera.
  echo Signalez-le : c'est un defaut, pas une erreur de manipulation.
  pause
  exit /b 1
)
echo       tache verifiee : elle existe et se declenchera toute seule.

echo [4/5] Agent du bouton (demarre a chaque ouverture de session)...
schtasks /create /f /tn "LaVitaPerTe - Agent pointage (!NOM_POSTE!)" ^
  /tr "wscript.exe %~dp0demarrer-agent.vbs" ^
  /sc onlogon
start "" wscript.exe "%~dp0demarrer-agent.vbs"

echo [5/5] Premiere collecte de verification (memoire entiere)...
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
