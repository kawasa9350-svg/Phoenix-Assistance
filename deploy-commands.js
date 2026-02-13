const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = require('./config.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load command data
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`📝 Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required properties`);
    }
}

// Validate configuration
if (!config.bot.token || config.bot.token === '') {
    console.error('❌ BOT_TOKEN is missing! Cannot deploy commands.');
    process.exit(1);
}

if (!config.bot.applicationId || config.bot.applicationId === '') {
    console.error('❌ APPLICATION_ID is missing! Cannot deploy commands.');
    process.exit(1);
}

// Create REST instance
const rest = new REST({ version: '10' }).setToken(config.bot.token);

// Deploy commands
(async () => {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        let data;
        
        // Determine deployment target preference
        // 1. Check DEPLOY_TARGET env var (from refresh-commands.bat)
        // 2. Check config.development.useGuildCommands
        const targetEnv = process.env.DEPLOY_TARGET;
        const configUseGuild = config.development && config.development.useGuildCommands;
        
        const preferGuild = (targetEnv === 'guild') || (!targetEnv && configUseGuild);
        const validGuildId = config.development && config.development.guildId && config.development.guildId !== "YOUR_TEST_GUILD_ID_HERE";
        
        const shouldDeployToGuild = preferGuild && validGuildId;

        // Check if we should use guild-specific commands for development
        if (shouldDeployToGuild) {
            console.log(`🎯 Deploying commands to guild: ${config.development.guildId}`);
            console.log(`⚡ Commands will be available INSTANTLY in this guild!`);
            
            // Deploy commands to specific guild (instant updates)
            data = await rest.put(
                Routes.applicationGuildCommands(config.bot.applicationId, config.development.guildId),
                { body: commands },
            );

            // OPTIONAL: Clear global commands to avoid duplicates
            // Commented out to prevent resetting integrations/permissions if you switch back and forth
            // console.log(`🧹 Clearing global commands to prevent duplicates...`);
            // await rest.put(
            //     Routes.applicationCommands(config.bot.applicationId),
            //     { body: [] },
            // );
        } else {
            console.log(`🌍 Deploying commands globally (may take up to 1 hour to update)`);
            if (targetEnv === 'global') {
                 console.log(`ℹ️  Forced global deployment via DEPLOY_TARGET environment variable.`);
            }
            
            // Deploy commands globally
            data = await rest.put(
                Routes.applicationCommands(config.bot.applicationId),
                { body: commands },
            );

            // OPTIONAL: Clear guild commands to avoid duplicates
            // Commented out to prevent resetting integrations/permissions
            // if (config.development.guildId) {
            //    console.log(`🧹 Clearing guild commands for ${config.development.guildId} to prevent duplicates...`);
            //    try {
            //        await rest.put(
            //            Routes.applicationGuildCommands(config.bot.applicationId, config.development.guildId),
            //            { body: [] },
            //        );
            //    } catch (e) {
            //        console.warn('⚠️ Could not clear guild commands (maybe bot is not in that guild?):', e.message);
            //    }
            // }
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        
        // List deployed commands
        console.log('\n📋 Deployed Commands:');
        data.forEach(command => {
            console.log(`  - /${command.name}: ${command.description}`);
        });
        
        if (shouldDeployToGuild) {
            console.log('\n🎯 Commands deployed to your test guild!');
            console.log('⚡ They are available INSTANTLY - no waiting required!');
        } else {
            console.log('\n🌍 Commands deployed globally');
            console.log('⏰ May take up to 1 hour to appear in all servers');
        }
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
})();
