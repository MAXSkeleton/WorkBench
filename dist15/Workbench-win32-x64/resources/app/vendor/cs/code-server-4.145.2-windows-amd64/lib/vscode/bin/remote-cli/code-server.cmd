@echo off
setlocal
set ROOT_DIR=%~dp0..\..\..\..
set VSROOT_DIR=%~dp0..\..
call "%ROOT_DIR%\lib\node.exe" "%VSROOT_DIR%\out\server-cli.js" "code-server" "1.145.2" "302bc77436721f5a474e06d1fe34cf8f86195d5e" "code-server.cmd" %*
endlocal
