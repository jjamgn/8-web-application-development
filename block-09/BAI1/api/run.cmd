@echo off
setlocal
set "BEP_NHA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%BEP_NHA_NODE%" set "BEP_NHA_NODE=node.exe"
"%BEP_NHA_NODE%" "%~dp0scripts\run.mjs" %*
exit /b %ERRORLEVEL%
