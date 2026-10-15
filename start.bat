@echo off
title MamakeSport Server
cd /d "%~dp0"
echo ==================================================
echo   Menjalankan MamakeSport Live Server...
echo   Buka browser di: http://localhost:3000
echo ==================================================
node server.js
pause
