@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Fairino Contract System - Windows Install
echo ----------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js LTS first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available. Please reinstall Node.js LTS.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  if exist ".env.package" copy /Y ".env.package" ".env.local" >nul
)

echo Installing dependencies. This may take a few minutes...
echo.
call npm install
if errorlevel 1 (
  echo.
  echo Install failed. Please check the network and try again.
  pause
  exit /b 1
)

echo.
echo Install completed.
echo Next time double-click start_windows.bat to open the system.
echo.
pause
