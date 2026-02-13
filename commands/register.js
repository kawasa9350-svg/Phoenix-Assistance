const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

const ALBION_API_BASE_URL = process.env.ALBION_API_BASE_URL || 'https://gameinfo.albiononline.com/api/gameinfo';

async function searchAlbionPlayers(ingameName) {
    const searchUrl = `${ALBION_API_BASE_URL}/search?q=${encodeURIComponent(ingameName)}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
        throw new Error(`Albion search failed with status ${searchRes.status}`);
    }
    const searchData = await searchRes.json();
    const players = searchData.players || [];
    // Return all exact matches
    return players.filter(p => typeof p.Name === 'string' && p.Name.toLowerCase() === ingameName.toLowerCase());
}

async function getPlayerDetails(playerId) {
    const playerUrl = `${ALBION_API_BASE_URL}/players/${playerId}`;
    const playerRes = await fetch(playerUrl);
    if (!playerRes.ok) {
        throw new Error(`Albion player lookup failed with status ${playerRes.status}`);
    }
    const playerData = await playerRes.json();
    return {
        guildName: playerData.GuildName || null,
        guildId: playerData.GuildId || null,
        ...playerData // Return full data just in case
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your in-game name with the guild')
        .addStringOption(option =>
            option.setName('in_game_name')
                .setDescription('Your Albion Online in-game name')
                .setRequired(true)
                .setMaxLength(50)),

    async execute(interaction, db) {
        try {
            // Check if guild is registered
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Guild Not Registered')
                    .setDescription('This guild must be registered first. Use `/guild-register` to get started.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Verify with Albion API
            try {
                // Get registered guild data to find the expected Albion guild name
                const guildCollection = await db.getGuildCollection(interaction.guildId);
                const guildData = await guildCollection.findOne({ guildId: interaction.guildId });
                const expectedGuildName = guildData ? guildData.guildName : null;

                if (expectedGuildName) {
                    const inGameName = interaction.options.getString('in_game_name');
                    const matches = await searchAlbionPlayers(inGameName);
                    
                    let selectedPlayerId = null;

                    if (matches.length === 0) {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Player Not Found')
                            .setDescription(`Could not find player **${inGameName}** in Albion Online. Please check the spelling.`)
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    } else if (matches.length === 1) {
                        selectedPlayerId = matches[0].Id;
                    } else {
                        // Multiple matches
                        // Limit to 10 to avoid API rate limits and ensure responsiveness
                        const candidateMatches = matches.slice(0, 10);
                        
                        // Fetch details for all candidates in parallel to get accurate Total Fame
                        await interaction.deferReply({ ephemeral: true });
                        
                        const detailedMatches = await Promise.all(candidateMatches.map(async (p) => {
                            try {
                                return await getPlayerDetails(p.Id);
                            } catch (e) {
                                console.error(`Failed to fetch details for ${p.Name}`, e);
                                return p; // Fallback to search result object
                            }
                        }));

                        const options = detailedMatches.map(p => {
                            let totalFame = 0;
                            if (p.LifetimeStatistics) {
                                const killFame = p.KillFame || 0;
                                const pveFame = p.LifetimeStatistics.PvE ? p.LifetimeStatistics.PvE.Total : 0;
                                const craftingFame = p.LifetimeStatistics.Crafting ? p.LifetimeStatistics.Crafting.Total : 0;
                                const gatheringFame = p.LifetimeStatistics.Gathering && p.LifetimeStatistics.Gathering.All ? p.LifetimeStatistics.Gathering.All.Total : 0;
                                const farmingFame = p.LifetimeStatistics.FarmingFame || 0;
                                const fishingFame = p.LifetimeStatistics.FishingFame || 0;
                                
                                totalFame = killFame + pveFame + craftingFame + gatheringFame + farmingFame + fishingFame;
                            } else {
                                // Fallback for search results without details
                                totalFame = (p.KillFame || 0) + (p.DeathFame || 0);
                            }

                            return {
                                label: `${p.Name} (${p.GuildName || 'No Guild'})`,
                                description: `Total Fame: ${totalFame.toLocaleString()}`,
                                value: p.Id
                            };
                        });

                        const row = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('select_player')
                                    .setPlaceholder('Select your character')
                                    .addOptions(options)
                            );

                        const response = await interaction.editReply({
                            content: `Found ${matches.length} players named **${inGameName}**. Please select yours:`,
                            components: [row],
                            fetchReply: true
                        });

                        try {
                            const confirmation = await response.awaitMessageComponent({ 
                                filter: i => i.user.id === interaction.user.id && i.customId === 'select_player', 
                                time: 60000 
                            });
                            
                            selectedPlayerId = confirmation.values[0];
                            await confirmation.update({ content: `Checking details for selected character...`, components: [] });
                        } catch (e) {
                            return interaction.editReply({ content: '❌ Selection timed out. Please try again.', components: [] });
                        }
                    }

                    const apiGuild = await getPlayerDetails(selectedPlayerId);

                    if (!apiGuild.guildName || apiGuild.guildName.toLowerCase() !== expectedGuildName.toLowerCase()) {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Guild Mismatch')
                            .setDescription(`Your in-game guild **${apiGuild.guildName || 'None'}** does not match this server's registered guild **${expectedGuildName}**.`)
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                            
                        if (interaction.replied || interaction.deferred) {
                            return interaction.editReply({ content: '', embeds: [embed], components: [] });
                        } else {
                            return interaction.reply({ embeds: [embed], ephemeral: true });
                        }
                    }
                }
            } catch (error) {
                console.error('Albion API check failed:', error);
                // Fail closed - if we can't verify, we don't register
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Verification Failed')
                    .setDescription('Failed to verify your guild with the Albion API. Please try again later.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.replied || interaction.deferred) {
                    return interaction.editReply({ content: '', embeds: [embed], components: [] });
                } else {
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

            const requestedInGameName = interaction.options.getString('in_game_name');
            const guildCollectionForNameCheck = await db.getGuildCollection(interaction.guildId);
            const guildDataForNameCheck = await guildCollectionForNameCheck.findOne({ guildId: interaction.guildId });

            if (guildDataForNameCheck && guildDataForNameCheck.users) {
                const targetNameLower = requestedInGameName.toLowerCase();
                let conflictingUserId = null;

                for (const [userId, userData] of Object.entries(guildDataForNameCheck.users)) {
                    if (userId === interaction.user.id) {
                        continue;
                    }
                    if (userData && typeof userData.inGameName === 'string' && userData.inGameName.toLowerCase() === targetNameLower) {
                        conflictingUserId = userId;
                        break;
                    }
                }

                if (conflictingUserId) {
                    let memberStillInGuild = false;
                    try {
                        await interaction.guild.members.fetch(conflictingUserId);
                        memberStillInGuild = true;
                    } catch (e) {
                        memberStillInGuild = false;
                    }

                    if (memberStillInGuild) {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ In-Game Name Already Registered')
                            .setDescription('This in-game name is already registered to another member in this server. If you believe this is your account, please contact an officer.')
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();

                        if (interaction.replied || interaction.deferred) {
                            return interaction.editReply({ content: '', embeds: [embed], components: [] });
                        } else {
                            return interaction.reply({ embeds: [embed], ephemeral: true });
                        }
                    }
                }
            }

            const existingUser = await db.getUserRegistration(interaction.guildId, interaction.user.id);
            if (existingUser) {
                // User is already registered, update their in-game name
                const oldInGameName = existingUser.inGameName;
                const newInGameName = interaction.options.getString('in_game_name');
                
                            // Check if user should get prefix based on roles (same logic as above)
            const member = interaction.member;
            const config = require('../config.js');
            let shouldApplyPrefix = false; // Default to skip prefix
            
            // Check if user has any roles that require prefix
            if (config.registration && config.registration.prefixRequiredRoles) {
                // If the verified role (which they are getting) requires a prefix, apply it
                const verifiedRoleId = '1233618625034850377';
                if (config.registration.prefixRequiredRoles.includes(verifiedRoleId)) {
                    shouldApplyPrefix = true;
                }

                for (const roleId of config.registration.prefixRequiredRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = true;
                        break;
                    }
                }
            }
            
            // Check if user has any roles that should skip prefix (overrides required)
            if (config.registration && config.registration.skipPrefixForRoles) {
                for (const roleId of config.registration.skipPrefixForRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = false;
                        break;
                    }
                }
            }

                const updateResult = await db.updateUserInGameName(interaction.guildId, interaction.user.id, newInGameName, shouldApplyPrefix);
                
                if (updateResult && updateResult.success) {
                    const embed = new EmbedBuilder()
                        .setColor('#00AA00')
                        .setTitle('✅ In-Game Name Updated!')
                        .setDescription(`Your in-game name has been updated from **${oldInGameName}** to **${newInGameName}**`)
                        .addFields(
                            { name: '🔄 Old Name', value: oldInGameName, inline: true },
                            { name: '🆕 New Name', value: newInGameName, inline: true },
                            { name: '👤 Discord User', value: interaction.user.toString(), inline: true }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();

                    try {
                        const member = interaction.member;
                        if (member && member.manageable) {
                            await member.setNickname(updateResult.displayName);
                            embed.addFields({
                                name: '✅ Nickname Updated',
                                value: `Your Discord nickname has been updated to: **${updateResult.displayName}**`,
                                inline: false
                            });
                        } else {
                            embed.addFields({
                                name: '⚠️ Manual Nickname Update Required',
                                value: `Your Discord nickname could not be updated automatically due to permission restrictions. Please manually change your nickname to: **${updateResult.displayName}**\n\n**Note:** Your in-game name has been updated in the database.`,
                                inline: false
                            });
                        }
                    } catch (nicknameError) {
                        console.error(`Could not update nickname for user ${interaction.user.id}:`, nicknameError.message);
                        embed.addFields({
                            name: '⚠️ Manual Nickname Update Required',
                            value: `Your Discord nickname could not be updated automatically. Please manually change your nickname to: **${updateResult.displayName}**\n\n**Note:** Your in-game name has been updated in the database.`,
                            inline: false
                        });
                    }

                    try {
                        const roleIdToAssign = '1233618625034850377';
                        const role = interaction.guild.roles.cache.get(roleIdToAssign);
                        if (role) {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            await member.roles.add(role);
                        }
                    } catch (roleError) {
                        console.error('Error assigning verification role:', roleError);
                    }

                    try {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.editReply({ content: '✅ Update complete.', components: [] });
                            await interaction.followUp({ embeds: [embed], ephemeral: false });
                        } else {
                            await interaction.reply({ embeds: [embed], ephemeral: false });
                        }
                    } catch (error) {
                        if (error.code === 10062 || error.code === 40060) {
                            console.log('Interaction already handled or timed out');
                        } else {
                            console.error('Error replying to interaction:', error);
                        }
                    }
                    return;
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Update Failed')
                        .setDescription('Failed to update your in-game name. Please try again or contact support.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    try {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.editReply({ content: '', embeds: [embed], components: [] });
                        } else {
                            await interaction.reply({ embeds: [embed], ephemeral: true });
                        }
                    } catch (error) {
                        if (error.code === 10062 || error.code === 40060) {
                            console.log('Interaction already handled or timed out');
                        } else {
                            console.error('Error replying to interaction:', error);
                        }
                    }
                    return;
                }
            }

            const inGameName = interaction.options.getString('in_game_name');

            // Check if user should get prefix based on roles
            const member = interaction.member;
            const config = require('../config.js');
            let shouldApplyPrefix = false; // Default to skip prefix
            
            // Check if user has any roles that require prefix
            if (config.registration && config.registration.prefixRequiredRoles) {
                // If the verified role (which they are getting) requires a prefix, apply it
                const verifiedRoleId = '1233618625034850377';
                if (config.registration.prefixRequiredRoles.includes(verifiedRoleId)) {
                    shouldApplyPrefix = true;
                }

                for (const roleId of config.registration.prefixRequiredRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = true;
                        break;
                    }
                }
            }
            
            // Check if user has any roles that should skip prefix (overrides required)
            if (config.registration && config.registration.skipPrefixForRoles) {
                for (const roleId of config.registration.skipPrefixForRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = false;
                        break;
                    }
                }
            }

            const result = await db.registerUser(interaction.guildId, interaction.user.id, inGameName, shouldApplyPrefix);

            if (result && result.success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Registration Successful!')
                    .setDescription(`You have been registered with the in-game name: **${inGameName}**`)
                    .addFields(
                        { name: '🎮 In-Game Name', value: inGameName, inline: true },
                        { name: '👤 Discord User', value: interaction.user.toString(), inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                try {
                    const member = interaction.member;
                    if (member && member.manageable) {
                        await member.setNickname(result.displayName);
                        embed.addFields({
                            name: '✅ Nickname Updated',
                            value: `Your Discord nickname has been updated to: **${result.displayName}**`,
                            inline: false
                        });
                    } else {
                        embed.addFields({
                            name: '⚠️ Manual Nickname Update Required',
                            value: `Your Discord nickname could not be updated automatically due to permission restrictions. Please manually change your nickname to: **${result.displayName}**\n\n**Note:** You are still registered in the database and can use all bot features.`,
                            inline: false
                        });
                    }
                } catch (nicknameError) {
                    console.error(`Could not update nickname for user ${interaction.user.id}:`, nicknameError.message);
                    embed.addFields({
                        name: '⚠️ Manual Nickname Update Required',
                        value: `Your Discord nickname could not be updated automatically. Please manually change your nickname to: **${result.displayName}**\n\n**Note:** You are still registered in the database and can use all bot features.`,
                        inline: false
                    });
                }

                try {
                    const roleIdToAssign = '1233618625034850377';
                    const role = interaction.guild.roles.cache.get(roleIdToAssign);
                    if (role) {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        await member.roles.add(role);
                    }
                } catch (roleError) {
                    console.error('Error assigning verification role:', roleError);
                }

                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({ content: '✅ Registration complete.', components: [] });
                        await interaction.followUp({ embeds: [embed], ephemeral: false });
                    } else {
                        await interaction.reply({ embeds: [embed], ephemeral: false });
                    }
                } catch (error) {
                    if (error.code === 10062 || error.code === 40060) {
                        console.log('Interaction already handled or timed out');
                    } else {
                        console.error('Error replying to interaction:', error);
                    }
                }
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Registration Failed')
                    .setDescription('Failed to register user. Please try again or contact support.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({ content: '', embeds: [embed], components: [] });
                    } else {
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                } catch (error) {
                    if (error.code === 10062 || error.code === 40060) {
                        console.log('Interaction already handled or timed out');
                    } else {
                        console.error('Error replying to interaction:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error in register command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while registering the user.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: '', embeds: [embed], components: [] });
                } else {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                if (replyError.code === 10062 || replyError.code === 40060) {
                    console.log('Interaction already handled or timed out');
                } else {
                    console.error('Error replying to interaction:', replyError);
                }
            }
        }
    },
};
