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
  echo [ERREUR] config.txt est absent de ce dossier :
  echo    %~dp0
  echo.
  rem DIRE OU L'ON A CHERCHE. Le message ne nommait pas le dossier, et le
  rem 10 septembre cela a coute un aller-retour : en decompressant l'archive
  rem DANS le dossier existant, on obtient un dossier imbrique
  rem Collecte-pointage\Collecte-pointage, et l'installeur lance depuis le
  rem second ne voit evidemment pas le config.txt reste dans le premier.
  echo Deux causes possibles :
  echo  1. Le chemin ci-dessus se termine par Collecte-pointage\Collecte-pointage\ :
  echo     l'archive a ete decompressee dans le dossier au lieu de le remplacer.
  echo     Remontez d'un cran et relancez installer.bat de la.
  echo  2. Le fichier a ete efface : recopiez config.exemple.txt en config.txt,
  echo     puis completez NOM_POSTE, HEURE_DEBUT et SECRET.
  pause
  exit /b 1
)

rem Une espace dans le chemin casserait les commandes des taches planifiees,
rem ou l'installeur devrait imbriquer des guillemets - ce qui est
rem precisement ce qui vient de faire echouer la creation de la tache. On
rem impose donc un chemin simple, et on le dit tout de suite.
rem ON TESTE LA VARIABLE, PAS UNE SORTIE DE COMMANDE.
rem La version d'origine envoyait le chemin dans un tube vers findstr.
rem Dans cmd, l'espace qui PRECEDE un tube fait partie du texte envoye :
rem echo emettait donc le chemin suivi d'une espace, findstr en trouvait
rem toujours une, et le refus tombait sur tous les postes, y compris ceux
rem dont le chemin etait parfaitement propre. Le 10 septembre, il annoncait
rem une espace dans C:\LaVitaPerTe\Collecte-pointage\ et demandait de
rem deplacer le dossier vers ce meme chemin.
rem
rem La substitution de chaine ne passe par aucun tube, aucun sous-processus,
rem et ne peut donc rien ajouter au texte teste.
set "CHEMIN=%~dp0"
if not "!CHEMIN!"=="!CHEMIN: =!" (
  echo [ERREUR] Le chemin de ce dossier contient une espace :
  echo    !CHEMIN!
  echo.
  echo Une espace casse les commandes des taches planifiees.
  echo Deplacez le dossier vers  C:\LaVitaPerTe\Collecte-pointage\  puis relancez.
  pause
  exit /b 1
)

rem Un dossier synchronise par OneDrive finit par casser la collecte, et
rem toujours en silence : les milliers de fichiers de node_modules partent
rem en synchronisation, les fichiers dits a la demande deviennent des liens
rem vides que Node ne sait pas lire a six heures du matin, et deux postes
rem sur un meme compte s'echangent leurs config.txt. On refuse plutot que
rem de laisser la panne arriver dans trois mois sans cause visible.
rem Meme methode, meme raison : pas de tube.
if not "!CHEMIN!"=="!CHEMIN:OneDrive=!" (
  echo [ERREUR] Ce dossier est dans OneDrive :
  echo    !CHEMIN!
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
set "SECRET="
for /f "tokens=1,* delims==" %%a in ('findstr /b "SECRET=" config.txt') do set "SECRET=%%b"

rem LE SECRET SE TESTE SUR SA VALEUR, sans tube ni chevron. La version
rem d'origine enchainait deux findstr et cherchait un chevron ouvrant, qui
rem est aussi l'operateur de redirection de cmd : deux raisons de casser
rem pour un controle qui tient en une comparaison.
if "!SECRET!"=="" (
  echo [ERREUR] La ligne SECRET est absente de config.txt.
  echo Demandez le secret de ce poste au responsable informatique.
  pause
  exit /b 1
)
if not "!SECRET!"=="!SECRET:demander=!" (
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
rem La version d'origine passait une commande composee de deux
rem instructions enchainees, avec des guillemets imbriques. cmd coupait
rem la ligne sur l'enchainement avant meme d'appeler schtasks, car le
rem batch ne sait pas echapper un guillemet interieur. La tache
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
