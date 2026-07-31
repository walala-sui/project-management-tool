@echo off
title Project Manager - Setup
cd /d "%~dp0"

echo ========================================
echo   Project Manager - One-Click Setup
echo ========================================
echo.

:: Step 1: Check Node.js
echo [1/3] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js not found!
    echo Please install Node.js first:
    echo   https://nodejs.org/   (download LTS version)
    echo.
    echo After installing, run this script again.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   Node.js %NODE_VER% - OK
echo.

:: Step 2: Install dependencies
echo [2/3] Installing dependencies...
if exist "node_modules\express\package.json" (
    echo   Dependencies already installed - skip
) else (
    echo   Running npm install...
    call npm install --registry=https://registry.npmmirror.com
    if %errorlevel% neq 0 (
        echo   Retrying with default registry...
        call npm install
    )
    if %errorlevel% neq 0 (
        echo   ERROR: npm install failed. Check network.
        pause
        exit /b 1
    )
    echo   Dependencies installed - OK
)
echo.

:: Step 3: Start server and open browser
echo [3/3] Starting server...
start "" http://localhost:3000
echo.
echo ========================================
echo   Server starting at http://localhost:3000
echo   Close this window to stop server.
echo ========================================
node server.js
pause
