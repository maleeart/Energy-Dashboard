@echo off
chcp 65001 > nul
title ระบบติดตามพลังงานไฟฟ้าและแบบจำลองอาคาร 3 มิติ สำนักงานไทรน้อย (Sainoi Energy Dashboard & 3D Twin)
echo ==============================================================================
echo    กำลังเริ่มระบบ Sainoi Energy Dashboard & 3D Building Digital Twin...
echo ==============================================================================
echo.
echo กำลังเปิด Web Server บนพอร์ต 8088...
echo.

start "" "http://localhost:8088/twin.html"
py -m http.server 8088

pause
