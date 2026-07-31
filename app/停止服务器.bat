@echo off
echo Stopping server on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
    taskkill /f /pid %%a 2>nul && echo Server stopped.
)
pause
