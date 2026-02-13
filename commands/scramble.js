const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const WORDS = [
    // Albion Online Words
    'ALBION', 'SILVER', 'MARKET', 'ISLAND', 'DUNGEON', 
    'HELLGATE', 'CRYSTAL', 'ARENA', 'FACTION', 'MOUNT', 
    'WEAPON', 'ARMOR', 'POTION', 'GUILD', 'ALLIANCE', 
    'HIDEOUT', 'GATHER', 'CRAFT', 'LYMHURST', 'MARTLOCK', 
    'THETFORD', 'BRIDGEWATCH', 'CAERLEON', 'MORGANA', 'KEEPER', 
    'UNDEAD', 'HERETIC', 'DIREWOLF', 'MAMMOTH', 'BASILISK',
    'CLAYMORE', 'DAGGER', 'QUARTERSTAFF', 'FROST', 'ARCANE',
    'HOLY', 'NATURE', 'CURSE', 'FIRE', 'SWORD', 'AXE',
    
    // General English Words
    'BANANA', 'JUNGLE', 'ROCKET', 'GUITAR', 'PLASTIC', 
    'OXYGEN', 'CAMERA', 'WINDOW', 'BOTTLE', 'CASTLE',
    'DOLPHIN', 'GARDEN', 'PLANET', 'SUMMER', 'WINTER',
    'DOCTOR', 'FAMILY', 'FRIEND', 'SCHOOL', 'OFFICE',
    'YELLOW', 'PURPLE', 'ORANGE', 'CIRCLE', 'SQUARE',
    'ANIMAL', 'FOREST', 'DESERT', 'OCEAN', 'VALLEY',
    'BRIDGE', 'STREET', 'MARKET', 'TEMPLE', 'PALACE',
    'DINNER', 'LUNCH', 'BREAKFAST', 'COFFEE', 'CHEESE',
    'VIOLIN', 'DRUMS', 'FLUTE', 'PIANO', 'TRUMPET',
    'SOCCER', 'TENNIS', 'HOCKEY', 'RUGBY', 'CRICKET',
    'TRAVEL', 'JOURNEY', 'VOYAGE', 'FLIGHT', 'CRUISE',
    'LAPTOP', 'TABLET', 'SCREEN', 'KEYBOARD', 'MOUSE',
    'MIRROR', 'CARPET', 'PILLOW', 'BLANKET', 'CURTAIN',
    'PENCIL', 'ERASER', 'MARKER', 'PAPER', 'FOLDER',
    'JACKET', 'SHIRT', 'PANTS', 'SHOES', 'SOCKS',
    'TOMATO', 'POTATO', 'CARROT', 'ONION', 'PEPPER',
    'TIGER', 'LION', 'ZEBRA', 'MONKEY', 'PANDA',
    'EAGLE', 'PARROT', 'PIGEON', 'SPARROW', 'HAWK',
    'SHARK', 'WHALE', 'OCTOPUS', 'JELLYFISH', 'CRAB',
    'RIVER', 'STREAM', 'LAKE', 'POND', 'CREEK',
    'CLOUD', 'STORM', 'THUNDER', 'RAIN', 'SNOW',
    'GALAXY', 'UNIVERSE', 'COMET', 'ASTEROID', 'STAR',
    'MAGIC', 'WIZARD', 'SPELL', 'POTION', 'WAND',
    'KING', 'QUEEN', 'PRINCE', 'KNIGHT', 'BARON',

    // More Animals
    'ELEPHANT', 'GIRAFFE', 'HIPPO', 'RHINO', 'CHEETAH',
    'LEOPARD', 'GORILLA', 'CHIMPANZEE', 'KANGAROO', 'KOALA',
    'PLATYPUS', 'WOMBAT', 'PENGUIN', 'SEAL', 'WALRUS',
    'OTTER', 'BEAVER', 'RACCOON', 'SKUNK', 'BADGER',
    'HEDGEHOG', 'SQUIRREL', 'RABBIT', 'HAMSTER', 'MOUSE',
    'LIZARD', 'SNAKE', 'TURTLE', 'CROCODILE', 'ALLIGATOR',
    'FROG', 'TOAD', 'SALAMANDER', 'NEWT', 'CHAMELEON',
    'BUTTERFLY', 'DRAGONFLY', 'BEETLE', 'SPIDER', 'SCORPION',

    // Food & Drinks
    'PIZZA', 'BURGER', 'SANDWICH', 'PASTA', 'NOODLE',
    'SUSHI', 'SASHIMI', 'RAMEN', 'CURRY', 'STEAK',
    'CHICKEN', 'TURKEY', 'DUCK', 'LAMB', 'PORK',
    'BACON', 'SAUSAGE', 'SALAMI', 'HAM', 'BEEF',
    'APPLE', 'BANANA', 'GRAPE', 'ORANGE', 'LEMON',
    'LIME', 'CHERRY', 'BERRY', 'MELON', 'PEACH',
    'PLUM', 'PEAR', 'MANGO', 'KIWI', 'PAPAYA',
    'WATER', 'MILK', 'JUICE', 'SODA', 'TEA',
    'COFFEE', 'BEER', 'WINE', 'CIDER', 'WHISKEY',
    'BREAD', 'TOAST', 'BAGEL', 'CROISSANT', 'MUFFIN',
    'CAKE', 'COOKIE', 'DONUT', 'BROWNIE', 'PIE',
    'CHOCOLATE', 'CANDY', 'SUGAR', 'HONEY', 'SYRUP',

    // Technology & Science
    'COMPUTER', 'INTERNET', 'NETWORK', 'SERVER', 'DATA',
    'CODE', 'PROGRAM', 'SOFTWARE', 'HARDWARE', 'SYSTEM',
    'ROBOT', 'DROID', 'CYBORG', 'LASER', 'PLASMA',
    'ATOM', 'MOLECULE', 'ELECTRON', 'PROTON', 'NEUTRON',
    'ENERGY', 'POWER', 'FORCE', 'GRAVITY', 'MAGNET',
    'LIGHT', 'SOUND', 'HEAT', 'COLD', 'WAVE',
    'SPACE', 'TIME', 'DIMENSION', 'REALITY', 'FUTURE',
    
    // Places & Nature
    'MOUNTAIN', 'HILL', 'VALLEY', 'CANYON', 'CAVE',
    'FOREST', 'JUNGLE', 'DESERT', 'SWAMP', 'MARSH',
    'OCEAN', 'SEA', 'LAKE', 'RIVER', 'POND',
    'ISLAND', 'BEACH', 'COAST', 'SHORE', 'BAY',
    'CITY', 'TOWN', 'VILLAGE', 'HAMLET', 'FARM',
    'PARK', 'GARDEN', 'FIELD', 'MEADOW', 'PLAINS',
    'NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTER',

    // Household & Daily Life
    'TABLE', 'CHAIR', 'SOFA', 'BED', 'DESK',
    'LAMP', 'LIGHT', 'CLOCK', 'WATCH', 'ALARM',
    'DOOR', 'WINDOW', 'FLOOR', 'WALL', 'ROOF',
    'KITCHEN', 'BATHROOM', 'BEDROOM', 'LIVING', 'GARAGE',
    'SPOON', 'FORK', 'KNIFE', 'PLATE', 'BOWL',
    'CUP', 'MUG', 'GLASS', 'BOTTLE', 'JAR',
    'SOAP', 'SHAMPOO', 'TOWEL', 'BRUSH', 'COMB',
    'TOOTH', 'PASTE', 'FLOSS', 'RAZOR', 'SHAVE',

    // Verbs & Actions
    'RUN', 'WALK', 'JUMP', 'SWIM', 'FLY',
    'CLIMB', 'CRAWL', 'DIVE', 'SLIDE', 'SKATE',
    'READ', 'WRITE', 'SPEAK', 'LISTEN', 'THINK',
    'LEARN', 'TEACH', 'STUDY', 'WORK', 'PLAY',
    'COOK', 'EAT', 'DRINK', 'SLEEP', 'WAKE',
    'WASH', 'CLEAN', 'BRUSH', 'SWEEP', 'MOP',
    'BUILD', 'CREATE', 'MAKE', 'FIX', 'REPAIR',
    
    // Adjectives & Abstract
    'HAPPY', 'SAD', 'ANGRY', 'EXCITED', 'BORED',
    'TIRED', 'HUNGRY', 'THIRSTY', 'SICK', 'HEALTHY',
    'GOOD', 'BAD', 'EVIL', 'KIND', 'MEAN',
    'FAST', 'SLOW', 'STRONG', 'WEAK', 'SMART',
    'STUPID', 'BRAVE', 'COWARD', 'RICH', 'POOR',
    'HOT', 'COLD', 'WARM', 'COOL', 'FRESH',
    'OLD', 'NEW', 'YOUNG', 'ANCIENT', 'MODERN',
    'BIG', 'SMALL', 'HUGE', 'TINY', 'GIANT',
    'RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE',
    'PURPLE', 'PINK', 'BROWN', 'BLACK', 'WHITE',
    'GOLD', 'SILVER', 'BRONZE', 'METAL', 'WOOD'
];

function scrambleWord(word) {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Ensure it's not the same as original
    const scrambled = arr.join('');
    if (scrambled === word && word.length > 1) return scrambleWord(word);
    return scrambled;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scramble')
        .setDescription('Challenge a player to unscramble a word for silver (5% tax)')
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
                .setTitle('🧩 Scramble Challenge')
                .setDescription(`${challenger} has challenged ${opponentUser} to a **Word Scramble** for **${amount.toLocaleString()}** silver!\n\n**Tax:** 5%\n**Rule:** First to unscramble the word wins!`)
                .addFields(
                    { name: 'Pot Size', value: `${(amount * 2).toLocaleString()}`, inline: true },
                    { name: 'Winner Receives', value: `${Math.floor((amount * 2) * 0.95).toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Expires in 60 seconds' });

            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('scramble_accept')
                        .setLabel('Accept Challenge')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('scramble_decline')
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.editReply({
                content: `${opponentUser}`,
                embeds: [acceptEmbed],
                components: [acceptRow]
            });

            const filter = i => i.user.id === opponentUser.id && ['scramble_accept', 'scramble_decline'].includes(i.customId);
            
            try {
                const confirmation = await message.awaitMessageComponent({ filter, time: 60000 });

                if (confirmation.customId === 'scramble_decline') {
                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Challenge Declined')
                        .setDescription(`${opponentUser} declined the scramble.`);
                    
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

                // 3. Game Phase
                const targetWord = WORDS[Math.floor(Math.random() * WORDS.length)];
                const scrambled = scrambleWord(targetWord);
                const endTime = Date.now() + 120000;

                const gameEmbed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🧩 UNSCRAMBLE THIS!')
                    .setDescription(`The first player to type the correct word wins!\n\n# \`${scrambled}\`\n\n⏳ Ends <t:${Math.floor(endTime / 1000)}:R>`)
                    .setFooter({ text: 'Type the answer in chat!' });

                await confirmation.update({ 
                    content: `${challenger} ${opponentUser} Get Ready!`, 
                    embeds: [gameEmbed], 
                    components: [] 
                });

                // Collector for Chat Messages
                // Filter: Must be one of the players, must match word (case insensitive)
                const gameFilter = m => {
                    return (m.author.id === challenger.id || m.author.id === opponentUser.id) && 
                           m.content.trim().toUpperCase() === targetWord;
                };

                const collector = interaction.channel.createMessageCollector({ filter: gameFilter, time: 120000, max: 1 });

                collector.on('collect', async m => {
                    // We have a winner!
                    const winner = m.author;
                    const loser = winner.id === challenger.id ? opponentUser : challenger;
                    
                    const winAmount = Math.floor((amount * 2) * 0.95);
                    await db.updateUserBalance(interaction.guildId, winner.id, winAmount, 'add');

                    const winEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🎉 We have a Winner!')
                        .setDescription(`# Correct! The word was **${targetWord}**\n\n🏆 **${winner}** won **${winAmount.toLocaleString()}** silver!`)
                        .addFields(
                            { name: 'Fastest Finger', value: `${winner}`, inline: true },
                            { name: 'Better Luck Next Time', value: `${loser}`, inline: true }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot • 5% Tax Applied' });

                    await interaction.followUp({ embeds: [winEmbed] });
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time' && collected.size === 0) {
                        // Timeout - Refund
                        await db.updateUserBalance(interaction.guildId, challenger.id, amount, 'add');
                        await db.updateUserBalance(interaction.guildId, opponentUser.id, amount, 'add');

                        const timeoutEmbed = new EmbedBuilder()
                            .setColor('#FFAA00')
                            .setTitle('⏱️ Time\'s Up!')
                            .setDescription(`Nobody guessed the word correctly.\nThe word was **${targetWord}**.\n\n**Refunded:** ${amount.toLocaleString()} silver to each player.`);

                        await interaction.followUp({ embeds: [timeoutEmbed] });
                    }
                });

            } catch (e) {
                if (e.code === 'InteractionCollectorError') {
                    // Challenge Accept Timeout
                    await interaction.editReply({ 
                        content: '⏱️ Challenge expired.', 
                        embeds: [], 
                        components: [] 
                    });
                } else {
                    console.error(e);
                    // Refund if money was taken but game crashed (hard to track exactly where, but good practice)
                    // For now just error message
                    await interaction.editReply({ 
                        content: '❌ An error occurred during the game.', 
                        components: [] 
                    });
                }
            }

        } catch (error) {
            console.error('Error in scramble command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            } else {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }
};
