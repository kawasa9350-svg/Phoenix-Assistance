const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ComponentType 
} = require('discord.js');

// Card Deck Utilities
const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class BlackjackTable {
    constructor(interaction, db) {
        this.interaction = interaction;
        this.db = db;
        this.channelId = interaction.channelId;
        this.guildId = interaction.guildId;
        this.players = new Map(); // userId -> { bet, hand, status: 'playing'|'stand'|'bust'|'blackjack', name }
        this.dealerHand = [];
        this.deck = [];
        this.state = 'BETTING'; // BETTING, PLAYING, FINISHED
        this.message = null;
        this.collector = null;
        this.inactivityTimeout = null;
    }

    resetTimeout() {
        if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
        // Auto-close table after 5 minutes of inactivity (gameplay)
        this.inactivityTimeout = setTimeout(() => this.closeTable(), 5 * 60 * 1000);
    }

    checkEmptyTimeout() {
        if (this.emptyTimeout) clearTimeout(this.emptyTimeout);
        
        if (this.players.size === 0) {
            // If table is empty, close after 1 minute
            this.emptyTimeout = setTimeout(() => {
                this.closeTable('Table closed because it was empty for 1 minute.');
            }, 60 * 1000);
        }
    }

    async init() {
        activeTables.set(this.guildId, this);
        this.checkEmptyTimeout(); // Start empty timer immediately

        const embed = this.renderEmbed();
        const components = this.renderComponents();

        this.message = await this.interaction.editReply({ 
            content: '🎰 **Guild Blackjack Table Open!**', 
            embeds: [embed], 
            components: components 
        });

        this.startCollector();
        this.resetTimeout();
    }

    startCollector() {
        this.collector = this.message.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: 3600000 // 1 hour max session per interaction (can be refreshed)
        });

        this.collector.on('collect', async i => {
            this.resetTimeout();
            try {
                if (i.customId === 'bj_join') await this.handleJoin(i);
                else if (i.customId === 'bj_leave') await this.handleLeave(i);
                else if (i.customId === 'bj_deal') await this.handleDeal(i);
                else if (i.customId === 'bj_hit') await this.handleHit(i);
                else if (i.customId === 'bj_stand') await this.handleStand(i);
                else if (i.customId === 'bj_refresh') {
                    await i.deferUpdate();
                    await this.updateTable(true);
                }
            } catch (error) {
                console.error('Blackjack Error:', error);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ An error occurred.', ephemeral: true });
                }
            }
        });
    }

    async handleJoin(i) {
        if (this.state !== 'BETTING') {
            return i.reply({ content: '🚫 Round in progress. Wait for the next hand!', ephemeral: true });
        }
        if (this.players.has(i.user.id)) {
            // Allow changing bet
            await this.showBetModal(i, 'Change Bet');
        } else {
            await this.showBetModal(i, 'Place Bet');
        }
    }

    async showBetModal(i, title) {
        const modal = new ModalBuilder()
            .setCustomId(`bj_bet_modal_${i.id}`) // Unique ID
            .setTitle(title);

        const betInput = new TextInputBuilder()
            .setCustomId('betAmount')
            .setLabel("Bet Amount (Silver)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g., 1000")
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(betInput);
        modal.addComponents(row);

        await i.showModal(modal);

        try {
            const submission = await i.awaitModalSubmit({ time: 30000 });
            
            if (this.state !== 'BETTING') {
                return submission.reply({ content: '🚫 Round already started. Please wait for the next hand.', ephemeral: true });
            }

            const amount = parseInt(submission.fields.getTextInputValue('betAmount').replace(/,/g, ''));

            if (isNaN(amount) || amount <= 0) {
                return submission.reply({ content: '❌ Invalid amount.', ephemeral: true });
            }

            // Check Limit
            if (amount > 250000) {
                return submission.reply({ content: '❌ Maximum bet limit is 250,000 Silver.', ephemeral: true });
            }

            // Check Balance
            const balance = await this.db.getUserBalance(this.guildId, submission.user.id);
            if (balance < amount) {
                return submission.reply({ content: `❌ Insufficient funds. Balance: ${balance.toLocaleString()}`, ephemeral: true });
            }

            // Register Player
            this.players.set(submission.user.id, {
                id: submission.user.id,
                name: submission.user.username,
                bet: amount,
                hand: [],
                status: 'waiting',
                ready: true // Auto-ready on join/bet
            });

            this.checkEmptyTimeout(); // Update empty timer status

            await submission.reply({ content: `✅ Bet placed: **${amount.toLocaleString()}** silver.`, ephemeral: true });
            await this.updateTable();

        } catch (e) {
            // Modal timeout or error
        }
    }

    async handleLeave(i) {
        if (!this.players.has(i.user.id)) {
            return i.reply({ content: 'You are not at the table.', ephemeral: true });
        }
        
        if (this.state !== 'BETTING') {
            return i.reply({ content: '🚫 Cannot leave during a hand! Finish playing first.', ephemeral: true });
        }

        this.players.delete(i.user.id);
        this.checkEmptyTimeout(); // Check if table is now empty
        await i.reply({ content: '👋 Left the table.', ephemeral: true });
        await this.updateTable();
    }

    async handleDeal(i) {
        if (!this.players.has(i.user.id)) {
            return i.reply({ content: '🚫 Only players seated at the table can deal the cards.', ephemeral: true });
        }
        if (this.state !== 'BETTING') return i.reply({ content: 'Game already in progress.', ephemeral: true });

        const p = this.players.get(i.user.id);
        p.ready = true;

        await i.deferUpdate();

        const allReady = Array.from(this.players.values()).every(pl => pl.ready);
        
        if (allReady) {
            if (this.startingTimeout) {
                clearTimeout(this.startingTimeout);
                this.startingTimeout = null;
                this.startTime = null;
            }
            await this.startRound();
        } else {
            if (!this.startingTimeout) {
                this.startTime = Math.floor((Date.now() + 15000) / 1000); // 15s countdown
                this.startingTimeout = setTimeout(() => this.startRound(), 15000);
            }
            await this.updateTable();
        }
    }

    async startRound() {
        this.startingTimeout = null;
        this.startTime = null;

        if (this.state !== 'BETTING') return;

        // Kick AFK (Unready) Players
        for (const [uid, p] of this.players) {
            if (!p.ready) {
                this.players.delete(uid);
            }
        }

        if (this.players.size === 0) {
             this.checkEmptyTimeout();
             await this.updateTable();
             return;
        }

        // Deduct bets
        const playerIds = Array.from(this.players.keys());
        for (const uid of playerIds) {
            const p = this.players.get(uid);
            const bal = await this.db.getUserBalance(this.guildId, uid);
            if (bal < p.bet) {
                this.players.delete(uid); // Kick if too poor now
                continue;
            }
            await this.db.updateUserBalance(this.guildId, uid, p.bet, 'subtract');
        }

        if (this.players.size === 0) {
             this.checkEmptyTimeout();
             await this.updateTable();
             return;
        }

        // Start Game
        this.state = 'PLAYING';
        this.deck = this.createDeck();
        this.dealerHand = [this.drawCard(), this.drawCard()];

        // Deal 2 cards to each player
        for (const p of this.players.values()) {
            p.hand = [this.drawCard(), this.drawCard()];
            p.status = 'playing';
            
            // Check Natural Blackjack
            if (this.calculateHand(p.hand) === 21) {
                p.status = 'blackjack';
            }
        }

        await this.updateTable();
        
        // Auto-check if everyone has blackjack (rare)
        if (Array.from(this.players.values()).every(p => p.status !== 'playing')) {
            await this.endRound();
        }
    }

    async handleHit(i) {
        const p = this.players.get(i.user.id);
        if (!p || this.state !== 'PLAYING' || p.status !== 'playing') {
            return i.reply({ content: '🚫 Not your turn or round ended.', ephemeral: true });
        }

        p.hand.push(this.drawCard());
        const val = this.calculateHand(p.hand);

        if (val > 21) {
            p.status = 'bust';
            await i.reply({ content: '💥 **BUST!**', ephemeral: true });
        } else if (val === 21) {
            p.status = 'stand'; // Auto stand on 21
            await i.reply({ content: '🎯 **21!**', ephemeral: true });
        } else {
            await i.deferUpdate();
        }

        await this.updateTable();
        await this.checkRoundEnd();
    }

    async handleStand(i) {
        const p = this.players.get(i.user.id);
        if (!p || this.state !== 'PLAYING' || p.status !== 'playing') {
            return i.reply({ content: '🚫 Not your turn.', ephemeral: true });
        }

        p.status = 'stand';
        await i.update({ content: '🛑 Stood.', components: [] }); // Clear ephemeral buttons if any? No, main msg updates
        await this.updateTable();
        await this.checkRoundEnd();
    }

    async checkRoundEnd() {
        const activePlayers = Array.from(this.players.values()).filter(p => p.status === 'playing');
        if (activePlayers.length === 0) {
            await this.endRound();
        }
    }

    async endRound() {
        this.state = 'FINISHED';

        // Dealer Turn
        let dealerVal = this.calculateHand(this.dealerHand);
        // Dealer hits on soft 17? Let's say stands on all 17s for simplicity or hits < 17
        while (dealerVal < 17) {
            this.dealerHand.push(this.drawCard());
            dealerVal = this.calculateHand(this.dealerHand);
        }

        // Calculate Payouts
        const dealerBust = dealerVal > 21;
        const dealerBj = dealerVal === 21 && this.dealerHand.length === 2;

        let results = [];

        for (const p of this.players.values()) {
            const pVal = this.calculateHand(p.hand);
            const pBj = pVal === 21 && p.hand.length === 2;
            let winAmount = 0;
            let outcome = '';

            if (p.status === 'bust') {
                outcome = '💥 Bust (Loss)';
            } else if (pBj && !dealerBj) {
                // Blackjack pays 3:2
                winAmount = Math.floor(p.bet * 2.5);
                outcome = `🃏 **BLACKJACK!** (+${(winAmount - p.bet).toLocaleString()})`;
            } else if (dealerBj && !pBj) {
                outcome = '❌ Dealer Blackjack (Loss)';
            } else if (pBj && dealerBj) {
                winAmount = p.bet; // Push
                outcome = '🤝 Push (Refund)';
            } else if (dealerBust) {
                winAmount = p.bet * 2;
                outcome = `🎉 Dealer Bust (+${p.bet.toLocaleString()})`;
            } else if (pVal > dealerVal) {
                winAmount = p.bet * 2;
                outcome = `🎉 Win (+${p.bet.toLocaleString()})`;
            } else if (pVal === dealerVal) {
                winAmount = p.bet;
                outcome = '🤝 Push (Refund)';
            } else {
                outcome = '❌ Loss';
            }

            p.outcome = outcome;
            if (winAmount > 0) {
                await this.db.updateUserBalance(this.guildId, p.id, winAmount, 'add');
            }
        }

        await this.updateTable(true); // Auto-refresh to bottom on round end

        // Reset for next round after delay
        setTimeout(async () => {
            if (this.message) { // Check if table still exists
                this.resetRound();
                await this.updateTable();
            }
        }, 10000); // Show results for 10 seconds
    }

    resetRound() {
        this.state = 'BETTING';
        this.dealerHand = [];
        if (this.startingTimeout) clearTimeout(this.startingTimeout);
        this.startingTimeout = null;
        this.startTime = null;
        // Keep players seated, but reset hands
        for (const p of this.players.values()) {
            p.hand = [];
            p.status = 'waiting';
            p.ready = false;
            delete p.outcome;
        }
    }

    createDeck() {
        const deck = [];
        for (const s of SUITS) {
            for (const v of VALUES) {
                deck.push({ suit: s, value: v });
            }
        }
        // Shuffle (Fisher-Yates)
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    drawCard() {
        return this.deck.pop();
    }

    calculateHand(hand) {
        let value = 0;
        let aces = 0;
        for (const card of hand) {
            if (card.value === 'A') {
                aces += 1;
                value += 11;
            } else if (['K', 'Q', 'J'].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }
        while (value > 21 && aces > 0) {
            value -= 10;
            aces -= 1;
        }
        return value;
    }

    formatHand(hand, hideSecond = false) {
        if (!hand || hand.length === 0) return '*Empty Table*';
        if (hideSecond) {
            return `${hand[0].suit} ${hand[0].value}   🂠 ?`;
        }
        return hand.map(c => `${c.suit} ${c.value}`).join('   ');
    }

    renderEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Guild Blackjack Table')
            .setColor(this.state === 'PLAYING' ? '#00AA00' : '#FFAA00');

        // 1. Dealer Section (Now in Description for Big Text)
        let dealerStatus = 'Waiting for bets...';
        let dealerCards = '🂠   🂠';
        
        if (this.state === 'PLAYING') {
            dealerCards = this.formatHand(this.dealerHand, true);
            dealerStatus = 'Waiting for players...';
        } else if (this.state === 'FINISHED') {
            dealerCards = this.formatHand(this.dealerHand, false);
            dealerStatus = `Score: **${this.calculateHand(this.dealerHand)}**`;
        }

        let description = '';
        
        // Add Countdown if applicable
        if (this.state === 'BETTING' && this.startTime) {
            description += `### ⏳ Game starting <t:${this.startTime}:R>\n*Click \`Ready\` to start immediately.*\n\n`;
        } else if (this.players.size === 0) {
            description += '**Welcome!**\nClick `Join / Bet` to take a seat.\n\n';
        }

        // Add Dealer Info to Description (using Headers)
        description += `**👨‍💼 Dealer (The House)**\n# ${dealerCards}\n${dealerStatus}`;
        
        embed.setDescription(description);

        // 2. Players Section (Fields)
        if (this.players.size > 0) {
            for (const p of this.players.values()) {
                let statusEmoji = '👤';
                let statusLine = '';
                
                if (this.state === 'BETTING') {
                    statusEmoji = p.ready ? '✅' : '⏳';
                    statusLine = `Bet: **${p.bet.toLocaleString()}**\n${p.ready ? '**Ready**' : 'Waiting...'}`;
                } else {
                    // Playing State
                    if (p.status === 'playing') { statusEmoji = '🤔'; statusLine = 'Turn: **Hit or Stand**'; }
                    else if (p.status === 'stand') { statusEmoji = '🛑'; statusLine = 'Status: **Stood**'; }
                    else if (p.status === 'bust') { statusEmoji = '💥'; statusLine = 'Status: **BUST**'; }
                    else if (p.status === 'blackjack') { statusEmoji = '🃏'; statusLine = 'Status: **Blackjack**'; }

                    if (this.state === 'FINISHED' && p.outcome) {
                        statusLine = p.outcome;
                    }
                }

                let handDisplay = this.state === 'BETTING' 
                    ? '*Waiting...*' 
                    : `**${this.formatHand(p.hand)}**\nScore: **${this.calculateHand(p.hand)}**`;

                embed.addFields({
                    name: `${statusEmoji}`,
                    value: `<@${p.id}>\n${handDisplay}\n${statusLine}`,
                    inline: true 
                });
            }
        }
        
        // Footer Status Bar
        let footerText = '';
        if (this.state === 'BETTING') footerText = 'Status: Betting Open | House Rules: Dealer stands on 17';
        else if (this.state === 'PLAYING') footerText = 'Status: In Progress... Hit or Stand!';
        else footerText = 'Status: Round Over | Preparing next round...';

        embed.setFooter({ text: footerText });

        return embed;
    }

    renderComponents() {
        const row = new ActionRowBuilder();

        if (this.state === 'BETTING' || this.state === 'FINISHED') {
            row.addComponents(
                new ButtonBuilder().setCustomId('bj_join').setLabel('Join / Bet').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('bj_leave').setLabel('Stand Up').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('bj_deal')
                    .setLabel(this.startingTimeout ? 'Vote Ready' : 'Start / Ready')
                    .setStyle(this.startingTimeout ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(this.players.size === 0),
                new ButtonBuilder().setCustomId('bj_refresh').setLabel('Refresh 🔄').setStyle(ButtonStyle.Secondary)
            );
        } else if (this.state === 'PLAYING') {
            row.addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Danger).setEmoji('🛑'),
                new ButtonBuilder().setCustomId('bj_refresh').setLabel('Refresh 🔄').setStyle(ButtonStyle.Secondary)
            );
        }

        return [row];
    }

    async updateTable(refresh = false) {
        try {
            if (refresh) {
                // Delete old message and send a new one
                try { await this.message.delete(); } catch (e) {}
                this.message = await this.interaction.channel.send({ 
                    content: '🎰 **Guild Blackjack Table (Refreshed)**',
                    embeds: [this.renderEmbed()], 
                    components: this.renderComponents() 
                });
                
                // We need to restart the collector on the new message
                if (this.collector) this.collector.stop('refresh');
                this.startCollector();
            } else {
                await this.message.edit({ embeds: [this.renderEmbed()], components: this.renderComponents() });
            }
        } catch (e) {
            console.error('Failed to update table:', e);
        }
    }

    async closeTable(reason = 'Table Closed due to inactivity.') {
        if (this.collector) this.collector.stop();
        if (this.emptyTimeout) clearTimeout(this.emptyTimeout);
        if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
        
        activeTables.delete(this.guildId);

        if (this.message) {
            try {
                await this.message.edit({ content: `🔒 ${reason}`, components: [] });
            } catch (e) {}
        }
    }
}

const activeTables = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Open a multiplayer Blackjack table'),

    async execute(interaction, db) {
        if (activeTables.has(interaction.guildId)) {
            const table = activeTables.get(interaction.guildId);
            return interaction.reply({ 
                content: `🚫 A Blackjack table is already open in <#${table.channelId}>!`, 
                ephemeral: true 
            });
        }

        await interaction.deferReply();
        const table = new BlackjackTable(interaction, db);
        await table.init();
    }
};
