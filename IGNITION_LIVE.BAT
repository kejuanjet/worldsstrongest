@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo   ===============================================
echo      WORLD'S STRONGEST - IGNITION LIVE DESKTOP
echo   ===============================================
echo.

node --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
  echo [!] Node.js is required to run the Vite live app.
  echo [!] Install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [!] package.json was not found in %CD%
  echo [!] This launcher must be run from the project folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\" (
  echo [!] Project dependencies are not installed yet.
  echo [*] Installing them now...
  call npm install
  if !ERRORLEVEL! NEQ 0 (
    echo.
    echo [!] npm install failed, so live desktop could not start.
    echo [!] Keep this window open and check the error above.
    echo.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [!] Electron binary not found.
  echo [*] Reinstalling Electron...
  call npm install electron --save-dev
  if !ERRORLEVEL! NEQ 0 (
    echo.
    echo [!] Electron installation failed.
    echo.
    pause
    exit /b 1
  )
)

set /a PORT=5173 + (%RANDOM% %% 200)
set URL=http://127.0.0.1:%PORT%/
set GAME_URL=%URL%

REM Unset ELECTRON_RUN_AS_NODE to ensure Electron runs properly
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ASAR=1

echo [*] Starting Vite dev server on %URL%
echo [*] Electron will launch once server is ready.
echo [*] Close Electron window to stop.
echo.

REM Use a simpler approach - run electron directly with vite in the background
REM The electron-main.cjs will connect to the vite server

node_modules\electron\dist\electron.exe electron-main.cjs --vite-url=%URL% --port=%PORT%

if !ERRORLEVEL! NEQ 0 (
  echo.
  echo [!] Electron exited with error code !ERRORLEVEL!
)

echo.
echo [*] Shutting down...
echo.
pause
