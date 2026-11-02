@echo off
chcp 65001 > nul
title Sainoi Energy Dashboard & 3D Building Digital Twin
echo ==============================================================================
echo    Starting Sainoi Energy Dashboard & 3D Building Digital Twin...
echo ==============================================================================
echo.
echo Launching Web Server on Port 8088...
echo.

start "" "http://localhost:8088/twin.html"
py -m http.server 8088

pause
