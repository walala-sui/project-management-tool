@echo off
title Project Manager
cd /d "%~dp0"

echo ========================================
echo   Project Manager
echo ========================================
echo.
echo Server starting on port 3000...
echo 本机访问: http://localhost:3000
echo 内网访问: http://你的服务器IP:3000
echo 如果其他人访问被拒，请检查防火墙是否放行3000端口
echo Press Ctrl+C to stop
echo ========================================
echo.
node server.js
pause
