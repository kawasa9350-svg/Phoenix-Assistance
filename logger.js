const http = require('http');

module.exports = function(botName) {
    // If the logger has already been initialized, do nothing.
    if (console.log.isPatchedByLogger) {
        return;
    }

    const originalLog = console.log;
    const originalError = console.error;

    function sendLog(type, args) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return '[Circular/Complex Object]';
                }
            }
            return String(arg);
        }).join(' ');

        const data = JSON.stringify({
            botName,
            type,
            message,
            timestamp: new Date().toISOString()
        });

        const options = {
            hostname: 'localhost',
            port: 3005,
            path: '/log',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            // Do nothing on response
        });

        req.on('error', (e) => {
            // Dashboard might be down, ignore error to prevent bot crash
        });

        req.write(data);
        req.end();
    }

    console.log = function(...args) {
        originalLog.apply(console, args);
        sendLog('log', args);
    };
    // Mark the function so we can detect if it's been patched.
    console.log.isPatchedByLogger = true;

    console.error = function(...args) {
        originalError.apply(console, args);
        sendLog('error', args);
    };
    // Mark the function so we can detect if it's been patched.
    console.error.isPatchedByLogger = true;
};
