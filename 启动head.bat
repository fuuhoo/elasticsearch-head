@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Starting elasticsearch-head at http://localhost:9100/
echo ES target is filled in the UI (no fixed target, proxy forwards per-request).
echo Press Ctrl+C to stop.
echo.

call npm run start

echo.
echo Server exited with code %errorlevel%. Press any key to close...
pause >nul
