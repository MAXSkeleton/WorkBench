@echo off
title workbench
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "node_modules\electron\dist\electron.exe" (
  echo [workbench] electron missing - run: npm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0." --no-sandbox