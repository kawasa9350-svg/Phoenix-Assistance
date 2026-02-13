require('dotenv').config();
const DatabaseManager = require('./database.js');

(async () => {
    const dbManager = new DatabaseManager();
    const connected = await dbManager.connect();

    if (!connected) {
        console.error('❌ Failed to connect to MongoDB, aborting cleanup.');
        process.exit(1);
    }

    const daysArg = parseInt(process.argv[2], 10);
    const days = Number.isNaN(daysArg) ? 30 : daysArg;

    console.log(`🧹 Deleting regear reservations older than ${days} days...`);
    const deleted = await dbManager.deleteOldRegearReservations(days);
    console.log(`✅ Cleanup complete. Deleted ${deleted} regear reservations.`);

    await dbManager.disconnect();
    process.exit(0);
})();

