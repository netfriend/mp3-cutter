@echo off
setlocal
set "APP_DIR=%~dp0.."
set "ELECTRON=%APP_DIR%\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo Electron belum terinstall. Jalankan npm install di folder proyek.
  exit /b 1
)

start "" "%ELECTRON%" "%APP_DIR%" %*
