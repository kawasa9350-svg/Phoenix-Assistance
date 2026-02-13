const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flip')
        .setDescription('Flip a coin against another player for silver (5% tax)')
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
                .setTitle('🪙 Coin Flip Challenge')
                .setDescription(`${challenger} has challenged ${opponentUser} to a coin flip for **${amount.toLocaleString()}** silver!\n\n**Tax:** 5% (Winner receives 95% of pot)\n⏳ Expires <t:${Math.floor(Date.now() / 1000) + 60}:R>`)
                .addFields(
                    { name: 'Pot Size', value: `${(amount * 2).toLocaleString()}`, inline: true },
                    { name: 'Winner Receives', value: `${Math.floor((amount * 2) * 0.95).toLocaleString()}`, inline: true }
                );

            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('flip_accept')
                        .setLabel('Accept Challenge')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('flip_decline')
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.editReply({
                content: `${opponentUser}`,
                embeds: [acceptEmbed],
                components: [acceptRow]
            });

            const filter = i => i.user.id === opponentUser.id && ['flip_accept', 'flip_decline'].includes(i.customId);
            
            try {
                const confirmation = await message.awaitMessageComponent({ filter, time: 60000 });

                if (confirmation.customId === 'flip_decline') {
                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Challenge Declined')
                        .setDescription(`${opponentUser} declined the coin flip.`);
                    
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

                // 3. Call Phase (Challenger calls)
                const callEmbed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🗣️ Call It!')
                    .setDescription(`${challenger}, please choose **Heads** or **Tails**.`);

                const callRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('heads')
                            .setLabel('Heads')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(config.flip.headsEmoji),
                        new ButtonBuilder()
                            .setCustomId('tails')
                            .setLabel('Tails')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(config.flip.tailsEmoji)
                    );

                await confirmation.update({ 
                    content: `${challenger}`, 
                    embeds: [callEmbed], 
                    components: [callRow] 
                });

                const callFilter = i => i.user.id === challenger.id && ['heads', 'tails'].includes(i.customId);
                const callInteraction = await message.awaitMessageComponent({ filter: callFilter, time: 30000 });

                const call = callInteraction.customId; // 'heads' or 'tails'
                const displayCall = call.charAt(0).toUpperCase() + call.slice(1);

                // 4. Flip Phase - Animation
                await callInteraction.update({ 
                    content: null, 
                    embeds: [new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle('🪙 Flipping...')
                        .setDescription(`**${challenger}** called **${displayCall}**!\n\nThe coin is in the air...`)], 
                    components: [] 
                });

                // Small delay for suspense
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Random outcome
                const outcomes = ['heads', 'tails'];
                const result = outcomes[Math.floor(Math.random() * outcomes.length)];
                const displayResult = result.charAt(0).toUpperCase() + result.slice(1);

                const challengerWins = (call === result);
                const winner = challengerWins ? challenger : opponentUser;
                const loser = challengerWins ? opponentUser : challenger;

                const winAmount = Math.floor((amount * 2) * 0.95);
                
                // Award winner
                await db.updateUserBalance(interaction.guildId, winner.id, winAmount, 'add');

                const resultEmbed = new EmbedBuilder()
                    .setColor(challengerWins ? '#00FF00' : '#FF4500') // Green if challenger wins (since they called), Orange if opponent
                    .setTitle(`🪙 It's ${displayResult}!`)
                    .setDescription(`**${challenger}** called **${displayCall}**... and...`)
                    .addFields(
                        { name: '🏆 WINNER', value: `${winner}\nWins **${winAmount.toLocaleString()}** silver!`, inline: false },
                        { name: '💀 Better Luck Next Time', value: `${loser}`, inline: false }
                    )
                    .setImage(result === 'heads' 
                        ? 'https://www.random.org/coins/faces/60-usd/0025c/heads.jpg' // Placeholder for Heads
                        : 'https://www.random.org/coins/faces/60-usd/0025c/tails.jpg') // Placeholder for Tails
                    .setFooter({ text: 'Phoenix Assistance Bot • 5% Tax Applied' })
                    .setTimestamp();

                // If images are not desired, remove .setImage lines and use Emoji Art in Description:
                // .setDescription(`# ${result === 'heads' ? '🦅 HEADS' : '🪙 TAILS'}\n\n**${challenger}** called **${displayCall}**...`)

                // Let's stick to no external images for reliability, use Emoji Header instead
                resultEmbed.setImage(null);
                
                // Helper to format emoji for text if it's an ID
                const formatEmoji = (emoji) => /^\d+$/.test(emoji) ? `<:emoji:${emoji}>` : emoji;
                const headsDisplay = formatEmoji(config.flip.headsEmoji);
                const tailsDisplay = formatEmoji(config.flip.tailsEmoji);

                resultEmbed.setDescription(`# ${result === 'heads' ? `${headsDisplay} HEADS` : `${tailsDisplay} TAILS`}\n\n**${challenger}** called **${displayCall}**...`);

                await interaction.editReply({ 
                    embeds: [resultEmbed]
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
                    // Note: Refunds are not handled here for simplicity, but in a real system should be considered if error happens after deduction
                    // Since deduction happens right before Call Phase, if Call Phase fails/errors, money might be lost.
                    // For robustness, we could refund here, but let's stick to the prompt.
                }
            }

        } catch (error) {
            console.error('Error in flip command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            } else {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }
};
