const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('payout-tracker')
        .setDescription('Track total silver paid out via paycheck')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

            // Get total payouts and history
            const totalPayouts = await db.getTotalPayouts(interaction.guildId);
            const { entries: payoutHistory, total: totalEntries } = await db.getPayoutHistory(interaction.guildId, 1, 10); // Page 1

            // Format history
            let historyText = 'No payouts recorded.';
            if (payoutHistory && payoutHistory.length > 0) {
                historyText = payoutHistory.map(p => {
                    const date = new Date(p.timestamp);
                    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return `• <@${p.userId}>: **${p.amount.toLocaleString()}** silver (${dateStr})`;
                }).join('\n');
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('💰 Total Payout Tracker')
                .setDescription('Tracking total silver removed via `/paycheck remove` since last reset.')
                .addFields(
                    { name: '📉 Total Paid Out', value: `${totalPayouts.toLocaleString()} silver`, inline: false },
                    { name: `📜 Payout History (Page 1/${Math.ceil(totalEntries / 10) || 1})`, value: historyText, inline: false }
                )
                .setFooter({ text: `Phoenix Assistance Bot • Total Records: ${totalEntries}` })
                .setTimestamp();

            // Create buttons row
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('payout_prev_1') // page 1
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true), // Disabled on first page
                    new ButtonBuilder()
                        .setCustomId('payout_reset')
                        .setLabel('Reset Tracker')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('payout_next_1') // current page 1
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(totalEntries <= 10) // Disabled if only 1 page
                );

            await interaction.reply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Error in payout-tracker command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching payout stats.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleButtonInteraction(interaction, db) {
        console.log('🔘 Payout button handler triggered');
        try {
            // Check permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: '❌ You do not have permission to use these controls.', 
                    ephemeral: true 
                });
            }

            if (interaction.customId === 'payout_reset') {
                console.log('🔘 Processing payout_reset for guild:', interaction.guildId);
                console.log('🔘 Resetting total payouts in DB...');
                await db.resetTotalPayouts(interaction.guildId);
                console.log('✅ DB reset complete');
                
                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('💰 Total Payout Tracker')
                    .setDescription('Tracking total silver removed via `/paycheck remove` since last reset.')
                    .addFields(
                        { name: '📉 Total Paid Out', value: `0 silver`, inline: false },
                        { name: '📜 Payout History (Page 1/1)', value: 'No payouts recorded.', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot • Total Records: 0 • Reset by ' + interaction.user.tag })
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('payout_prev_1')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('payout_reset')
                            .setLabel('Reset Tracker')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔄'),
                        new ButtonBuilder()
                            .setCustomId('payout_next_1')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                console.log('🔘 Updating interaction...');
                await interaction.update({ embeds: [embed], components: [row] });
                console.log('✅ Interaction updated');
            }
            else if (interaction.customId.startsWith('payout_prev_') || interaction.customId.startsWith('payout_next_')) {
                const isNext = interaction.customId.startsWith('payout_next_');
                const currentPage = parseInt(interaction.customId.split('_')[2]);
                const newPage = isNext ? currentPage + 1 : currentPage - 1;
                
                const totalPayouts = await db.getTotalPayouts(interaction.guildId);
                const { entries: payoutHistory, total: totalEntries } = await db.getPayoutHistory(interaction.guildId, newPage, 10);
                const totalPages = Math.ceil(totalEntries / 10) || 1;

                // Format history
                let historyText = 'No payouts recorded.';
                if (payoutHistory && payoutHistory.length > 0) {
                    historyText = payoutHistory.map(p => {
                        const date = new Date(p.timestamp);
                        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return `• <@${p.userId}>: **${p.amount.toLocaleString()}** silver (${dateStr})`;
                    }).join('\n');
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('💰 Total Payout Tracker')
                    .setDescription('Tracking total silver removed via `/paycheck remove` since last reset.')
                    .addFields(
                        { name: '📉 Total Paid Out', value: `${totalPayouts.toLocaleString()} silver`, inline: false },
                        { name: `📜 Payout History (Page ${newPage}/${totalPages})`, value: historyText, inline: false }
                    )
                    .setFooter({ text: `Phoenix Assistance Bot • Total Records: ${totalEntries}` })
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`payout_prev_${newPage}`)
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(newPage <= 1),
                        new ButtonBuilder()
                            .setCustomId('payout_reset')
                            .setLabel('Reset Tracker')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔄'),
                        new ButtonBuilder()
                            .setCustomId(`payout_next_${newPage}`)
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(newPage >= totalPages)
                    );

                await interaction.update({ embeds: [embed], components: [row] });
            }
        } catch (error) {
            console.error('Error in payout-tracker button handler:', error);
            // Try to reply if not already replied
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ An error occurred while processing the button.', ephemeral: true });
                } else {
                    await interaction.followUp({ content: '❌ An error occurred while processing the button.', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to send error response:', e);
            }
        }
    }
};
