const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check user balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check balance for (leave empty for your own balance)')
                .setRequired(false)),

    async execute(interaction, db) {
        await interaction.deferReply({ ephemeral: true });
        try {
            // Check if guild is registered
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Guild Not Registered')
                    .setDescription('This guild must be registered first. Use `/guild-register` to get started.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user') || interaction.user;

            // Check if target user is registered
            const userRegistration = await db.getUserRegistration(interaction.guildId, targetUser.id);
            if (!userRegistration) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ User Not Registered')
                    .setDescription(`${targetUser.toString()} is not registered with the guild.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }

            // Get user balance
            const balance = await db.getUserBalance(interaction.guildId, targetUser.id);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💰 Balance Check')
                .setDescription(`${targetUser.toString()}'s balance information`)
                .addFields(
                    { name: '👤 User', value: targetUser.toString(), inline: true },
                    { name: '🎮 In-Game Name', value: userRegistration.inGameName, inline: true },
                    { name: '💵 Balance', value: `${balance.toLocaleString()} silver`, inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error in balance command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while checking the balance.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
    },
};
