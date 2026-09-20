@echo off
setlocal

cd /d "%~dp0"

if not exist TNLX.ico (
  echo ERROR: TNLX.ico not found in %CD%
  exit /b 1
)

where rsrc.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: rsrc.exe not found. Install with:
  echo   go install github.com/akavel/rsrc@latest
  exit /b 1
)

echo Generating Windows icon resources...
rsrc.exe -arch 386 -ico TNLX.ico -o rsrc_windows_386.syso
if errorlevel 1 exit /b 1
rsrc.exe -arch amd64 -ico TNLX.ico -o rsrc_windows_amd64.syso
if errorlevel 1 exit /b 1

echo Building RUN_CHECK 32-bit...
set GOOS=windows
set GOARCH=386
set CGO_ENABLED=0
go build -ldflags="-s -w" -o RUN_CHECK_32.exe .
if errorlevel 1 exit /b 1

echo Building RUN_CHECK 64-bit...
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0
go build -ldflags="-s -w" -o RUN_CHECK_64.exe .
if errorlevel 1 exit /b 1

echo Done.
echo   RUN_CHECK_32.exe
echo   RUN_CHECK_64.exe
