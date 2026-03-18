@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo   ╔═══════════════════════════════════════════════════════════╗
echo   ║   WORLD'S STRONGEST - Electron Live Dev Mode              ║
echo   ╚═══════════════════════════════════════════════════════════╝
echo.

REM Check for Node.js (Required for npx and live updates)
node --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
  echo [!] ERROR: Node.js is required for Live Updates.
  echo [!] Please install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM Ensure the Electron main script actually exists and isn't blank
set "MAIN_SIZE=0"
if exist "electron-main.js" (
  for %%A in ("electron-main.js") do set "MAIN_SIZE=%%~zA"
)
if not exist "electron-main.js" (
  set "MAIN_SIZE=0"
)
if "!MAIN_SIZE!"=="0" (
  echo [*] Generating electron-main.js...
  (
    echo import { app, BrowserWindow, shell } from "electron";
    echo import path from "node:path";
    echo import { fileURLToPath } from "node:url";
    echo.
    echo const __filename = fileURLToPath^(import.meta.url^);
    echo const __dirname = path.dirname^(__filename^);
    echo const GAME_URL = process.env.GAME_URL ^|^| "http://localhost:5173/";
    echo.
    echo app.commandLine.appendSwitch^("disable-renderer-backgrounding"^);
    echo.
    echo function createWindow^(^) {
    echo   const win = new BrowserWindow^({
    echo     width: 1600,
    echo     height: 960,
    echo     minWidth: 1280,
    echo     minHeight: 720,
    echo     autoHideMenuBar: true,
    echo     backgroundColor: "#05070c",
    echo     webPreferences: ^{
    echo       contextIsolation: true,
    echo       sandbox: false,
    echo       nodeIntegration: true,
    echo       backgroundThrottling: false,
    echo     ^},
    echo   }^);
    echo.
    echo   win.webContents.setWindowOpenHandler^(({ url }^) =^> ^{
    echo     shell.openExternal^(url^);
    echo     return { action: "deny" };
    echo   }^);
    echo.
    echo   win.loadURL^(GAME_URL^);
    echo   return win;
    echo }
    echo.
    echo app.whenReady^(^).then^(^(^) =^> ^{
    echo   createWindow^(^);
    echo   app.on^("activate", ^(^) =^> ^{
    echo     if ^(BrowserWindow.getAllWindows^(^).length === 0^) createWindow^(^);
    echo   }^);
    echo }^);
    echo.
    echo app.on^("window-all-closed", ^(^) =^> ^{
    echo   if ^(process.platform !== "darwin"^) app.quit^(^);
    echo }^);
  ) > electron-main.js
)

REM Install Electron locally to bypass broken npx caches (Fixes "Can't run on PC")
if not exist "node_modules\electron\" (
  echo [*] First-time setup: Installing Electron locally... ^(This takes a minute^)
  call npm install electron live-server --no-save
)

set /a PORT=5173 + (%RANDOM% %% 200)
set GAME_URL=http://localhost:%PORT%/

echo [✓] Found Node.js
echo [*] Starting Live Server on %GAME_URL%

REM Start live-server in a hidden, minimized window
start "WS_Live_Server" /MIN node node_modules\live-server\live-server.js --port=!PORT! --no-browser

REM Give the server a moment to start up
timeout /t 3 /nobreak >nul

echo [*] Launching Electron App...
REM Execute the raw Windows Electron binary directly to bypass Node.js child_process bugs
if exist "node_modules\electron\dist\electron.exe" (
  "node_modules\electron\dist\electron.exe" electron-main.js
) else (
  echo [!] Local binary not found, falling back to npx...
  call npx --yes electron electron-main.js
)

REM Fallback just in case Electron completely fails to load
if !ERRORLEVEL! NEQ 0 (
  echo [!] Electron failed to start. Falling back to browser...
  start "" "%GAME_URL%"
  echo [*] Press Ctrl+C to stop the server when finished.
)

echo.
echo [*] Cleaning up processes...
REM Kill the background server window when Electron closes
taskkill /FI "WINDOWTITLE eq WS_Live_Server*" /T /F >nul 2>&1

echo.
pause
