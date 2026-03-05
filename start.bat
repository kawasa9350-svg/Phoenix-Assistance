@echo off
title Albion Assistance Bot
echo ==========================================
echo    Albion Assistance Bot - Local Launcher
echo ==========================================
echo.

echo [INFO] Starting Ngrok Tunnel (External Window)...
start "Ngrok Tunnel" /D ".." cmd /c "start-ngrok.bat"
echo.

if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b %ERRORLEVEL%
    )
    echo [INFO] Dependencies installed.
    echo.
)

echo [INFO] Updating Discord commands...
call node deploy-commands.js
echo.

echo [INFO] Starting Bot...
echo [INFO] Press Ctrl+C to stop.
echo.
npx nodemon index.js

echo.
echo [INFO] Bot stopped.
pause