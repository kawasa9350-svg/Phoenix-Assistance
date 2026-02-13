const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('High roll (1-100) against another player for silver (5% tax)')
        .addUserOption(option => 
            option.setName('opponent')
                .setDescription('The user you want to challenge')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('Amount of silver to wager')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction, db) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const opponentUser = interaction.options.getUser('opponent');
            const amount = interaction.options.getInteger('amount');
            const challenger = interaction.user;

            // 1. Validation
            if (opponentUser.id === challenger.id) {
                return interaction.editReply({ 
                    content: '❌ You cannot play against yourself!', 
                    ephemeral: true 
                });
            }
            if (opponentUser.bot) {
                return interaction.editReply({ 
                    content: '❌ You cannot play against a bot!', 
                    ephemeral: true 
                });
            }

            const challengerRegistered = await db.isUserRegistered(interaction.guildId, challenger.id);
            const opponentRegistered = await db.isUserRegistered(interaction.guildId, opponentUser.id);

            if (!challengerRegistered) {
                return interaction.editReply({ 
                    content: '❌ You are not registered. Use `/register` first.', 
                    ephemeral: true 
                });
            }
            if (!opponentRegistered) {
                return interaction.editReply({ 
                    content: `❌ ${opponentUser} is not registered.`, 
                    ephemeral: true 
                });
            }

            const challengerBalance = await db.getUserBalance(interaction.guildId, challenger.id);
            const opponentBalance = await db.getUserBalance(interaction.guildId, opponentUser.id);

            if (challengerBalance < amount) {
                return interaction.editReply({ 
                    content: `❌ You do not have enough silver. Balance: ${challengerBalance}`, 
                    ephemeral: true 
                });
            }
            if (opponentBalance < amount) {
                return interaction.editReply({ 
                    content: `❌ ${opponentUser} does not have enough silver. Balance: ${opponentBalance}`, 
                    ephemeral: true 
                });
            }

            // 2. Challenge Phase
            const acceptEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎲 High Roll Challenge')
                .setDescription(`${challenger} has challenged ${opponentUser} to a **High Roll** (1-100) for **${amount.toLocaleString()}** silver!\n\n**Tax:** 5% (Winner receives 95% of pot)\n**Rule:** Highest roll wins. Ties refund.\n⏳ Expires <t:${Math.floor(Date.now() / 1000) + 60}:R>`)
                .addFields(
                    { name: 'Pot Size', value: `${(amount * 2).toLocaleString()}`, inline: true },
                    { name: 'Winner Receives', value: `${Math.floor((amount * 2) * 0.95).toLocaleString()}`, inline: true }
                );

            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roll_accept')
                        .setLabel('Accept Challenge')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('roll_decline')
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.editReply({
                content: `${opponentUser}`,
                embeds: [acceptEmbed],
                components: [acceptRow]
            });

            const filter = i => i.user.id === opponentUser.id && ['roll_accept', 'roll_decline'].includes(i.customId);
            
            try {
                const confirmation = await message.awaitMessageComponent({ filter, time: 60000 });

                if (confirmation.customId === 'roll_decline') {
                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Challenge Declined')
                        .setDescription(`${opponentUser} declined the roll.`);
                    
                    await confirmation.update({ content: null, embeds: [declineEmbed], components: [] });
                    return;
                }

                // Accepted
                // Re-check balances just in case
                const currentChallengerBal = await db.getUserBalance(interaction.guildId, challenger.id);
                const currentOpponentBal = await db.getUserBalance(interaction.guildId, opponentUser.id);

                if (currentChallengerBal < amount || currentOpponentBal < amount) {
                    await confirmation.update({ 
                        content: '❌ One of the participants no longer has enough funds.', 
                        embeds: [], 
                        components: [] 
                    });
                    return;
                }

                // Deduct funds immediately
                await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'subtract');
                await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'subtract');

                // 3. Rolling Phase (Interactive)
                let rolls = {};
                rolls[challenger.id] = null;
                rolls[opponentUser.id] = null;

                const rollEmbed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🎲 Roll Your Dice!')
                    .setDescription(`Both players need to roll their dice!\n\n**${challenger}**: Waiting...\n**${opponentUser}**: Waiting...`);

                const rollRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('roll_dice')
                            .setLabel('Roll 🎲')
                            .setStyle(ButtonStyle.Primary)
                    );

                await confirmation.update({ 
                    content: `${challenger} ${opponentUser}`, 
                    embeds: [rollEmbed], 
                    components: [rollRow] 
                });

                // Collector for dice rolls
                const rollFilter = i => (i.user.id === challenger.id || i.user.id === opponentUser.id) && i.customId === 'roll_dice';
                const rollCollector = message.createMessageComponentCollector({ filter: rollFilter, time: 60000 });

                rollCollector.on('collect', async i => {
                    try {
                        if (rolls[i.user.id] !== null) {
                            return i.reply({ content: 'You already rolled!', ephemeral: true });
                        }

                        const roll = Math.floor(Math.random() * 100) + 1;
                        rolls[i.user.id] = roll;

                        await i.reply({ content: `You rolled a **${roll}**! 🎲`, ephemeral: true });

                        // Update public embed
                        const challengerStatus = rolls[challenger.id] ? `Rolled! ✅` : `Waiting...`;
                        const opponentStatus = rolls[opponentUser.id] ? `Rolled! ✅` : `Waiting...`;

                        const updatedEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('🎲 Roll Your Dice!')
                            .setDescription(`Both players need to roll their dice!\n\n**${challenger}**: ${challengerStatus}\n**${opponentUser}**: ${opponentStatus}`);
                        
                        // If both rolled, finish
                        if (rolls[challenger.id] && rolls[opponentUser.id]) {
                            rollCollector.stop('finished');
                        } else {
                            await message.edit({ embeds: [updatedEmbed] });
                        }
                    } catch (error) {
                        console.error('Error in roll collector:', error);
                    }
                });

                rollCollector.on('end', async (collected, reason) => {
                    if (reason === 'finished') {
                        // 4. Generate Results
                        const roll1 = rolls[challenger.id];
                        const roll2 = rolls[opponentUser.id];

                        let winner = null;
                        let loser = null;
                        let isTie = false;

                        if (roll1 > roll2) {
                            winner = challenger;
                            loser = opponentUser;
                        } else if (roll2 > roll1) {
                            winner = opponentUser;
                            loser = challenger;
                        } else {
                            isTie = true;
                        }

                        if (isTie) {
                            // Refund
                            await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'add');
                            await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'add');

                            const tieEmbed = new EmbedBuilder()
                                .setColor('#FFAA00')
                                .setTitle('🎲 It\'s a Tie!')
                                .setDescription(`# 🤝 TIE!\n\n**${challenger}** rolled: **${roll1}**\n**${opponentUser}** rolled: **${roll2}**\n\n**Refunded:** ${amount.toLocaleString()} silver to each player.`)
                                .setFooter({ text: 'Phoenix Assistance Bot' })
                                .setTimestamp();

                            await message.edit({ embeds: [tieEmbed], components: [] });
                        } else {
                            // Award Winner
                            const winAmount = Math.floor((amount * 2) * 0.95);
                            await db.updateUserBalance(interaction.guildId, winner.id, winAmount, 'add');

                            const resultEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle(`🎲 High Roll Results`)
                                .setDescription(`# 🎉 ${winner} Wins!\n\n**${challenger}** rolled: **${roll1}**\n**${opponentUser}** rolled: **${roll2}**`)
                                .addFields(
                                    { name: '🏆 WINNER', value: ` ${winner}\nWins **${winAmount.toLocaleString()}** silver!`, inline: false },
                                    { name: '💀 Better Luck Next Time', value: `${loser}`, inline: false }
                                )
                                .setFooter({ text: 'Phoenix Assistance Bot • 5% Tax Applied' })
                                .setTimestamp();

                            await message.edit({ embeds: [resultEmbed], components: [] });
                        }
                    } else {
                        // Timeout - Refund whoever rolled (or both if stuck)
                        // Simple policy: Refund everyone for now to avoid lost funds
                        await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'add');
                        await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'add');

                        await message.edit({ 
                            content: '⏱️ Game timed out. Both players refunded.', 
                            embeds: [], 
                            components: [] 
                        });
                    }
                });

            } catch (e) {
                if (e.code === 'InteractionCollectorError') {
                    // Timeout
                    await interaction.editReply({ 
                        content: '⏱️ Challenge expired.', 
                        embeds: [], 
                        components: [] 
                    });
                } else {
                    console.error(e);
                    await interaction.editReply({ 
                        content: '❌ An error occurred during the game.', 
                        components: [] 
                    });
                }
            }

        } catch (error) {
            console.error('Error in roll command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            } else {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }
};
