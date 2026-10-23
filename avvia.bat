@echo off
rem Installa (se serve), compila la UI e avvia Firestarter su http://127.0.0.1:8000
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python non trovato. Esegui: winget install Python.Python.3.12  e riapri il terminale.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Esegui: winget install OpenJS.NodeJS.LTS  e riapri il terminale.
  pause
  exit /b 1
)
where pandoc >nul 2>nul
if errorlevel 1 echo ATTENZIONE: Pandoc non trovato, gli export DOCX falliranno. Esegui: winget install JohnMacFarlane.Pandoc

echo [1/3] Installazione backend...
py -m pip install -q -e backend
if errorlevel 1 goto :errore

if not exist frontend\node_modules (
  echo [2/3] Installazione frontend...
  pushd frontend
  call npm install
  popd
)
if not exist frontend\dist\index.html (
  echo [2/3] Compilazione interfaccia...
  pushd frontend
  call npm run build
  popd
)
if not exist frontend\dist\index.html goto :errore

echo [3/3] Avvio su http://127.0.0.1:8000  - chiudi questa finestra per fermare.
start "" /b powershell -NoProfile -Command "Start-Sleep 3; Start-Process 'http://127.0.0.1:8000'"
py -m firestarter
pause
exit /b 0

:errore
echo Qualcosa e' andato storto: copia l'errore qui sopra.
pause
exit /b 1
