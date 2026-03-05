@echo off
:loop
node --tls-min-v1.2 --openssl-legacy-provider index.js
echo Phoenix Assistance Bot has crashed. Restarting in 5 seconds...
timeout /t 5
goto loop