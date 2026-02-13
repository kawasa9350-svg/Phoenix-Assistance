require('dotenv').config();

const config = {
  bot: {
    token: process.env.BOT_TOKEN || "",
    applicationId: process.env.APPLICATION_ID || "",
    prefix: "!",
    intents: ["Guilds", "GuildMessages"]
  },
  database: {
    uri: process.env.MONGODB_URI || "",
    databaseName: process.env.DATABASE_NAME || "albion_assistance"
  },
  development: {
    guildId: process.env.GUILD_ID || "",
    useGuildCommands: false
  },
  embeds: {
    colors: {
      success: "#00FF00",
      error: "#FF0000",
      info: "#0099FF",
      warning: "#FFAA00"
    },
    footer: "Phoenix Assistance Bot"
  },
  permissions: {
    defaultAdminCommands: ["register", "perms-add", "perms-remove"],
    defaultContentCommands: ["add-content", "build", "content-list"]
  },
  features: {
    enableDMs: false
  },
  integrations: {
    allianceWebhookSecret: process.env.ALLIANCE_WEBHOOK_SECRET || "",
    defaultCallerFeeRate: parseFloat(process.env.CALLER_FEE_RATE || "0") || 0,
    allianceNotificationChannelId: process.env.ALLIANCE_NOTIFICATION_CHANNEL_ID || ""
  },
  flip: {
    // Replace these with the Custom Emoji IDs you want to use
    // Format for custom emojis: "123456789012345678" (ID only for buttons) or full "<:name:id>" for text
    // If you paste the ID here, make sure to update flip.js to handle it correctly if it needs to be formatted
    // For now, we assume these are just the EMOJI CHARACTERS or IDs.
    // If you want to use the images you provided, you must upload them to Discord and get their IDs.
    headsEmoji: "1468414025024143495", 
    tailsEmoji: "1468414026223714497"
  },
  registration: {
    prefixRequiredRoles: ["1233618625034850377"],
    skipPrefixForRoles: [""]
  }
};

module.exports = config;
