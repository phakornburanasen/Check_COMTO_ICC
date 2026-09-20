@echo off
setlocal

cd /d "%~dp0"

if not exist dist mkdir dist

echo Building CHECKCOM_API.exe (windows/amd64)...
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0
go build -ldflags="-s -w" -o dist\CHECKCOM_API.exe .
if errorlevel 1 exit /b 1

echo Building CHECKCOM_API (linux/amd64)...
set GOOS=linux
set GOARCH=amd64
set CGO_ENABLED=0
go build -ldflags="-s -w" -o dist\CHECKCOM_API .
if errorlevel 1 exit /b 1

endlocal

echo Done.
echo   dist\CHECKCOM_API.exe   (windows/amd64)
echo   dist\CHECKCOM_API       (linux/amd64)
