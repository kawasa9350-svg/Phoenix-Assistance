const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('russian')
        .setDescription('Russian Roulette Minigame')
        .addSubcommand(subcommand =>
            subcommand
                .setName('roulette')
                .setDescription('Challenge a player to Russian Roulette (5% tax)')
                .addUserOption(option => 
                    option.setName('opponent')
                        .setDescription('The user you want to challenge')
                        .setRequired(true))
                .addIntegerOption(option => 
                    option.setName('amount')
                        .setDescription('Amount of silver to wager')
                        .setRequired(true)
                        .setMinValue(1))),

    async execute(interaction, db) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const opponentUser = interaction.options.getUser('opponent');
            const amount = interaction.options.getInteger('amount');
            const challenger = interaction.user;

            // --- 1. Validation ---
            if (opponentUser.id === challenger.id) {
                return interaction.editReply({ content: '❌ You cannot play against yourself!', ephemeral: true });
            }
            if (opponentUser.bot) {
                return interaction.editReply({ content: '❌ You cannot play against a bot!', ephemeral: true });
            }

            const challengerRegistered = await db.isUserRegistered(interaction.guildId, challenger.id);
            const opponentRegistered = await db.isUserRegistered(interaction.guildId, opponentUser.id);

            if (!challengerRegistered) return interaction.editReply({ content: '❌ You are not registered. Use `/register` first.', ephemeral: true });
            if (!opponentRegistered) return interaction.editReply({ content: `❌ ${opponentUser} is not registered.`, ephemeral: true });

            const challengerBalance = await db.getUserBalance(interaction.guildId, challenger.id);
            const opponentBalance = await db.getUserBalance(interaction.guildId, opponentUser.id);

            if (challengerBalance < amount) return interaction.editReply({ content: `❌ You do not have enough silver. Balance: ${challengerBalance}`, ephemeral: true });
            if (opponentBalance < amount) return interaction.editReply({ content: `❌ ${opponentUser} does not have enough silver. Balance: ${opponentBalance}`, ephemeral: true });

            // --- 2. Challenge Phase ---
            const acceptEmbed = new EmbedBuilder()
                .setColor('#AA0000') // Red for danger
                .setTitle('🔫 Russian Roulette Challenge')
                .setDescription(`${challenger} has challenged ${opponentUser} to Russian Roulette for **${amount.toLocaleString()}** silver!\n\n**Rules:**\n- 6 Chambers, 1 Bullet.\n- Take turns pulling the trigger.\n- Last one standing wins.\n- **Tax:** 5% (Winner receives 95% of pot)\n\n⏳ Expires <t:${Math.floor(Date.now() / 1000) + 60}:R>`)
                .addFields(
                    { name: 'Pot Size', value: `${(amount * 2).toLocaleString()}`, inline: true },
                    { name: 'Winner Receives', value: `${Math.floor((amount * 2) * 0.95).toLocaleString()}`, inline: true }
                );

            const acceptRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rr_accept').setLabel('Accept Challenge').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('rr_decline').setLabel('Decline').setStyle(ButtonStyle.Secondary)
            );

            const message = await interaction.editReply({
                content: `${opponentUser}`,
                embeds: [acceptEmbed],
                components: [acceptRow]
            });

            // Filter for Accept/Decline
            const response = await message.awaitMessageComponent({
                filter: i => i.user.id === opponentUser.id && ['rr_accept', 'rr_decline'].includes(i.customId),
                time: 60000,
                componentType: ComponentType.Button
            }).catch(() => null);

            if (!response) {
                const expiredEmbed = EmbedBuilder.from(acceptEmbed).setColor('#808080').setDescription('❌ Challenge expired.');
                return interaction.editReply({ content: null, embeds: [expiredEmbed], components: [] });
            }

            if (response.customId === 'rr_decline') {
                const declinedEmbed = EmbedBuilder.from(acceptEmbed).setColor('#FF0000').setDescription(`❌ ${opponentUser} declined the challenge.`);
                await response.update({ content: null, embeds: [declinedEmbed], components: [] });
                return;
            }

            // --- 3. Game Initialization ---
            await response.deferUpdate();

            // Re-check balances before starting
            const cBal = await db.getUserBalance(interaction.guildId, challenger.id);
            const oBal = await db.getUserBalance(interaction.guildId, opponentUser.id);
            if (cBal < amount || oBal < amount) {
                return interaction.editReply({ content: '❌ One of the players no longer has enough funds.', embeds: [], components: [] });
            }

            // Deduct Bets
            await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'subtract');
            await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'subtract');

            // Game State
            let bulletPosition = Math.floor(Math.random() * 6); // 0-5
            let currentChamber = 0;
            let turnPlayer = challenger; // Challenger starts
            let waitingPlayer = opponentUser;
            let gameOver = false;
            let history = []; // Track clicks

            const getGameEmbed = (status) => {
                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('🔫 Russian Roulette')
                    .setDescription(`**Pot:** ${(amount * 2).toLocaleString()}\n\n${history.join('\n')}\n\n**${status}**`);
                
                return embed;
            };

            const getGameRow = (disabled = false) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('rr_trigger')
                        .setLabel('Pull Trigger 😰')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(disabled)
                );
            };

            // Game Loop
            while (!gameOver) {
                const embed = getGameEmbed(`It is ${turnPlayer}'s turn to pull the trigger...`);
                await interaction.editReply({ content: `${turnPlayer}`, embeds: [embed], components: [getGameRow()] });

                try {
                    const triggerInteraction = await message.awaitMessageComponent({
                        filter: i => i.user.id === turnPlayer.id && i.customId === 'rr_trigger',
                        time: 30000, // 30s turn timer
                        componentType: ComponentType.Button
                    });

                    // Check chamber
                    if (currentChamber === bulletPosition) {
                        // BANG!
                        gameOver = true;
                        history.push(`💥 **BANG!** ${turnPlayer} pulled the trigger and died.`);
                        
                        const winAmount = Math.floor((amount * 2) * 0.95);
                        await db.updateUserBalance(interaction.guildId, waitingPlayer.id, winAmount, 'add');

                        const finalEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('💀 Game Over')
                            .setDescription(`${history.join('\n')}\n\n🏆 **${waitingPlayer} Wins!**\n💰 Won: **${winAmount.toLocaleString()}** silver`);

                        await triggerInteraction.update({ content: null, embeds: [finalEmbed], components: [] });

                    } else {
                        // CLICK
                        history.push(`💨 *Click*... ${turnPlayer} survives.`);
                        currentChamber++;
                        
                        // Swap turns
                        [turnPlayer, waitingPlayer] = [waitingPlayer, turnPlayer];
                        
                        await triggerInteraction.update({ content: `${turnPlayer}`, embeds: [getGameEmbed(`It is ${turnPlayer}'s turn...`)], components: [getGameRow()] });
                    }

                } catch (e) {
                    // Timeout
                    gameOver = true;
                    const winAmount = Math.floor((amount * 2) * 0.95);
                    // Winner gets paid because loser forfeited
                    await db.updateUserBalance(interaction.guildId, waitingPlayer.id, winAmount, 'add');

                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle('⏱️ Time Out')
                        .setDescription(`${turnPlayer} was too scared to pull the trigger!\n\n🏆 **${waitingPlayer} Wins by default!**\n💰 Won: **${winAmount.toLocaleString()}** silver`);

                    await interaction.editReply({ content: null, embeds: [timeoutEmbed], components: [] });
                }
            }

        } catch (error) {
            console.error(error);
            interaction.editReply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
        }
    }
};
