const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors against another player (5% tax)')
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
                .setTitle('⚔️ RPS Duel Challenge')
                .setDescription(`${challenger} has challenged ${opponentUser} to **Rock Paper Scissors** for **${amount.toLocaleString()}** silver!\n\n**Tax:** 5%\n**Rule:** Standard RPS rules.\n⏳ Expires <t:${Math.floor(Date.now() / 1000) + 60}:R>`)
                .addFields(
                    { name: 'Pot Size', value: `${(amount * 2).toLocaleString()}`, inline: true },
                    { name: 'Winner Receives', value: `${Math.floor((amount * 2) * 0.95).toLocaleString()}`, inline: true }
                );

            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('rps_accept')
                        .setLabel('Accept Duel')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('rps_decline')
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.editReply({
                content: `${opponentUser}`,
                embeds: [acceptEmbed],
                components: [acceptRow]
            });

            const filter = i => i.user.id === opponentUser.id && ['rps_accept', 'rps_decline'].includes(i.customId);
            
            try {
                const confirmation = await message.awaitMessageComponent({ filter, time: 60000 });

                if (confirmation.customId === 'rps_decline') {
                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Duel Declined')
                        .setDescription(`${opponentUser} fled from the battle.`);
                    
                    await confirmation.update({ content: null, embeds: [declineEmbed], components: [] });
                    return;
                }

                // Accepted
                // Re-check balances
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

                // Deduct funds
                await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'subtract');
                await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'subtract');

                // 3. Battle Phase
                const battleEmbed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('⚔️ Choose Your Weapon!')
                    .setDescription(`Pick your move secretly.\n\n**${challenger}**: Thinking...\n**${opponentUser}**: Thinking...\n⏳ Ends <t:${Math.floor(Date.now() / 1000) + 60}:R>`);

                const battleRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('rps_rock')
                            .setEmoji('🪨')
                            .setLabel('Rock')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('rps_paper')
                            .setEmoji('📄')
                            .setLabel('Paper')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('rps_scissors')
                            .setEmoji('✂️')
                            .setLabel('Scissors')
                            .setStyle(ButtonStyle.Primary)
                    );

                await confirmation.update({ 
                    content: `${challenger} ${opponentUser}`, 
                    embeds: [battleEmbed], 
                    components: [battleRow] 
                });

                // Collector for moves
                const moves = {};
                moves[challenger.id] = null;
                moves[opponentUser.id] = null;

                const moveFilter = i => (i.user.id === challenger.id || i.user.id === opponentUser.id) && 
                                      ['rps_rock', 'rps_paper', 'rps_scissors'].includes(i.customId);
                
                const moveCollector = message.createMessageComponentCollector({ filter: moveFilter, time: 60000 });

                moveCollector.on('collect', async i => {
                    try {
                        if (moves[i.user.id]) {
                            return i.reply({ content: 'You already chose your weapon!', ephemeral: true });
                        }

                        const move = i.customId.replace('rps_', '');
                        moves[i.user.id] = move;

                        await i.reply({ content: `You chose **${move.toUpperCase()}**!`, ephemeral: true });

                        // Update public status
                        const p1Status = moves[challenger.id] ? 'Ready! ✅' : 'Thinking...';
                        const p2Status = moves[opponentUser.id] ? 'Ready! ✅' : 'Thinking...';

                        const updatedEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('⚔️ Choose Your Weapon!')
                            .setDescription(`Pick your move secretly.\n\n**${challenger}**: ${p1Status}\n**${opponentUser}**: ${p2Status}`);

                        if (moves[challenger.id] && moves[opponentUser.id]) {
                            moveCollector.stop('finished');
                        } else {
                            await message.edit({ embeds: [updatedEmbed] });
                        }

                    } catch (error) {
                        console.error('Error in RPS collector:', error);
                    }
                });

                moveCollector.on('end', async (collected, reason) => {
                    if (reason === 'finished') {
                        // 4. Determine Winner
                        const m1 = moves[challenger.id];
                        const m2 = moves[opponentUser.id];
                        
                        let winner = null;
                        let loser = null;
                        let tie = false;

                        // Rock > Scissors > Paper > Rock
                        if (m1 === m2) {
                            tie = true;
                        } else if (
                            (m1 === 'rock' && m2 === 'scissors') ||
                            (m1 === 'scissors' && m2 === 'paper') ||
                            (m1 === 'paper' && m2 === 'rock')
                        ) {
                            winner = challenger;
                            loser = opponentUser;
                        } else {
                            winner = opponentUser;
                            loser = challenger;
                        }

                        const emojiMap = { rock: '🪨', paper: '📄', scissors: '✂️' };

                        if (tie) {
                            // Refund
                            await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'add');
                            await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'add');

                            const tieEmbed = new EmbedBuilder()
                                .setColor('#FFAA00')
                                .setTitle('⚔️ Draw!')
                                .setDescription(`Both players chose ${emojiMap[m1]} **${m1.toUpperCase()}**!\n\n**Refunded:** ${amount.toLocaleString()} silver to each player.`);
                            
                            await message.edit({ embeds: [tieEmbed], components: [] });
                        } else {
                            // Payout
                            const winAmount = Math.floor((amount * 2) * 0.95);
                            await db.updateUserBalance(interaction.guildId, winner.id, winAmount, 'add');

                            const winEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('⚔️ Duel Results')
                                .setDescription(`# 🎉 ${winner} Wins!`)
                                .addFields(
                                    { name: 'Player 1', value: `${challenger}\n${emojiMap[m1]} ${m1.toUpperCase()}`, inline: true },
                                    { name: 'VS', value: '⚡', inline: true },
                                    { name: 'Player 2', value: `${opponentUser}\n${emojiMap[m2]} ${m2.toUpperCase()}`, inline: true },
                                    { name: '🏆 WINNER', value: `${winner} wins **${winAmount.toLocaleString()}** silver!`, inline: false }
                                )
                                .setFooter({ text: 'Phoenix Assistance Bot • 5% Tax Applied' });

                            await message.edit({ embeds: [winEmbed], components: [] });
                        }

                    } else {
                        // Timeout - Refund
                        await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'add');
                        await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'add');

                        const timeoutEmbed = new EmbedBuilder()
                            .setColor('#FFAA00')
                            .setTitle('⏱️ Duel Cancelled')
                            .setDescription('Time ran out. Both players refunded.');

                        await message.edit({ embeds: [timeoutEmbed], components: [] });
                    }
                });

            } catch (e) {
                if (e.code === 'InteractionCollectorError') {
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
            console.error('Error in rps command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            } else {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }
};
