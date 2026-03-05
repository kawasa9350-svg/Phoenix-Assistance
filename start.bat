@echo off
:loop
node --openssl-legacy-provider index.js
echo Phoenix Assistance Bot has crashed. Restarting in 5 seconds...
timeout /t 5
goto loop