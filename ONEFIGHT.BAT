@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo   ===============================================
echo      WORLD'S STRONGEST - ONEFIGHT SMOKE TEST
echo   ===============================================
echo.

node --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
  echo [!] Node.js is required to run ONEFIGHT.
  echo [!] Install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [!] package.json was not found in %CD%
  echo [!] Run this launcher from the project folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo [!] Project dependencies are missing.
  echo [*] Installing them now...
  call npm install
  if !ERRORLEVEL! NEQ 0 (
    echo.
    echo [!] npm install failed, so ONEFIGHT could not start.
    echo.
    pause
    exit /b 1
  )
)

echo [*] Launching automated AYO vs RAYNE smoke test...
echo [*] Screenshots and report will be written under test-results\onefight\
echo.

node scripts\onefight-runner.cjs %*
set EXIT_CODE=!ERRORLEVEL!

echo.
if !EXIT_CODE! EQU 0 (
  echo [+] ONEFIGHT completed successfully.
) else (
  echo [!] ONEFIGHT found failures or could not complete.
)
echo [*] Check test-results\onefight\ for screenshots and result.json
echo.
pause
exit /b !EXIT_CODE!
