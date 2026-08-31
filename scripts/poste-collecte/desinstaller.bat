@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo ============================================================
echo  Retrait de la collecte automatique des pointages
echo ============================================================
echo.

cd /d "%~dp0"

set "NOM_POSTE=poste"
if exist config.txt (
  for /f "tokens=1,* delims==" %%a in ('findstr /b "NOM_POSTE=" config.txt') do set "NOM_POSTE=%%b"
)
echo Poste : !NOM_POSTE!
echo.

schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage (!NOM_POSTE!)" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Agent pointage (!NOM_POSTE!)" 2>nul

rem Noms des versions precedentes : deux collectes par jour, sans nom de poste.
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage matin (!NOM_POSTE!)" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage apres-midi (!NOM_POSTE!)" 2>nul

rem Anciens noms, sans nom de poste : installations faites avant que
rem plusieurs postes ne coexistent.
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage matin" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Collecte pointage apres-midi" 2>nul
schtasks /delete /f /tn "LaVitaPerTe - Agent pointage" 2>nul

taskkill /f /im node.exe /fi "WINDOWTITLE eq agent.mjs" >nul 2>nul

echo.
echo ============================================================
echo  Taches supprimees de ce poste.
echo.
echo  IL RESTE UNE CHOSE, ET ELLE N'EST PAS SUR CETTE MACHINE :
echo  demandez au responsable informatique d'effacer le secret de
echo  ce poste cote serveur. Tant qu'il y figure, quiconque
echo  recupere config.txt peut encore deposer des pointages.
echo ============================================================
pause
