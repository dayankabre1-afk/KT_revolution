@echo off
cd /d "%~dp0"
echo === Ma Boutique : demarrage ===

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js n'est pas installe.
  echo Installe la version 22 LTS depuis https://nodejs.org puis relance ce fichier.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo.
  echo Ta version de Node.js est trop ancienne. Installe la version 22.13 ou plus recente.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  powershell -NoProfile -Command "$s=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N'); (Get-Content .env -Encoding UTF8) -replace '^JWT_SECRET=.*', ('JWT_SECRET='+$s) | Set-Content .env -Encoding UTF8"
  echo Fichier .env cree avec un secret de session aleatoire.
)

findstr /r /c:"^ADMIN_PASSWORD=$" .env >nul
if not errorlevel 1 (
  echo.
  echo Choisis ton mot de passe administrateur. Le Bloc-notes va s'ouvrir :
  echo ecris-le apres ADMIN_PASSWORD= ^(8 caracteres minimum^), enregistre, puis ferme.
  notepad .env
)

echo Installation des dependances, patiente un moment...
call npm install
if errorlevel 1 (
  echo.
  echo L'installation a echoue. Verifie ta connexion Internet et copie-moi les lignes d'erreur.
  pause
  exit /b 1
)

echo.
echo Le site va s'ouvrir sur http://localhost:3000 ^(Ctrl+C pour arreter^)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
call npm start
pause
