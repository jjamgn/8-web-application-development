@echo off
setlocal
rem Use the installed Codex runtime without changing the user's system PATH.
set "BEP_NHA_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "BEP_NHA_NODE=%BEP_NHA_RUNTIME%\node\bin\node.exe"
set "BEP_NHA_PNPM=%BEP_NHA_RUNTIME%\node\node_modules\pnpm\bin\pnpm.mjs"
if not exist "%BEP_NHA_NODE%" (
  echo Node.js from the Codex runtime was not found. Install Node.js and pnpm, then use pnpm normally. 1>&2
  exit /b 1
)
if not exist "%BEP_NHA_PNPM%" (
  echo pnpm from the Codex runtime was not found. Install pnpm, then use pnpm normally. 1>&2
  exit /b 1
)
set "PATH=%BEP_NHA_RUNTIME%\node\bin;%PATH%"
set "pnpm_config_pm_on_fail=ignore"
"%BEP_NHA_NODE%" "%BEP_NHA_PNPM%" %*
exit /b %ERRORLEVEL%
