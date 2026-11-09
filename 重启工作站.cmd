@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Closing running workbench windows...
taskkill /im Workbench.exe /f >nul 2>&1
wmic process where "name='electron.exe'" delete >nul 2>&1
ping -n 3 127.0.0.1 >nul
if exist "dist\Workbench-win32-x64\Workbench.exe" (
  echo Starting: dist\Workbench-win32-x64\Workbench.exe
  start "" "dist\Workbench-win32-x64\Workbench.exe"
) else (
  echo No packaged build found, starting dev mode...
  start "" "node_modules\electron\dist\electron.exe" "%~dp0." --no-sandbox
)