@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo   ╔═══════════════════════════════════════════════════════════╗
echo   ║   WORLD'S STRONGEST - Fighting Game Demo                ║
echo   ╚═══════════════════════════════════════════════════════════╝
echo.

set /a PORT=5173 + (%RANDOM% %% 200)
set URL=http://localhost:%PORT%/

REM Check if dist folder exists (built version)
if exist dist\index.html (
  echo [✓] Found dist/index.html (built version)
  cd dist
  goto :start_server
)

REM Fallback to root index.html (development version)
if exist index.html (
  echo [!] Warning: Using development version (dist not found)
  echo [✓] Found index.html
  goto :start_server
)

echo [!] ERROR: index.html not found in %CD% or %CD%\dist
echo [!] Cannot launch the game without an entry point
echo [!] Run 'npm run build' first to build the game
echo.
pause
goto :end

:start_server
echo [*] Starting server on %URL%
echo [*] Press Ctrl+C in this window to stop the server
echo.

timeout /t 1 /nobreak >nul
REM Open browser first, then start server (server blocks)
start "" "%URL%"

REM Try Python first (faster and more reliable)
python --version >nul 2>&1
if !ERRORLEVEL! EQU 0 (
  echo [✓] Using Python HTTP server
  python -m http.server %PORT%
  goto :end
)

py --version >nul 2>&1
if !ERRORLEVEL! EQU 0 (
  echo [✓] Using Python HTTP server
  py -m http.server %PORT%
  goto :end
)

REM Fallback to Node.js if available
npx http-server -p %PORT% 2>nul
if !ERRORLEVEL! EQU 0 (
  echo [✓] Using Node.js HTTP server
  goto :end
)

echo.
echo [!] ERROR: Could not start server
echo [!] Python or Node.js is required but not found
echo [!] Install from:
echo     - https://www.python.org/downloads/
echo     - https://nodejs.org/
echo.
pause

:end

