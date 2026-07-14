@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Fairino Contract System - Starting
echo ---------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js LTS first: https://nodejs.org/
  echo Then run install_windows.bat.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  if exist ".env.package" copy /Y ".env.package" ".env.local" >nul
)

if not exist "node_modules" (
  echo Dependencies are missing. Installing now...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Please check the network and try again.
    pause
    exit /b 1
  )
)

echo Browser will open http://127.0.0.1:3000/
echo Keep this window open while using the system.
echo.
start "" cmd /c "timeout /t 8 /nobreak >nul && start "" http://127.0.0.1:3000/"
call npm run dev
pause
