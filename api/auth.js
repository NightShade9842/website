// api/auth.js
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

let pool;
function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 1,
            charset: 'utf8mb4'
        });
    }
    return pool;
}

const JWT_SECRET = process.env.JWT_SECRET || 'sabaody-jwt-secret-change-me';

function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    try {
        const token = authHeader.split(' ')[1];
        return jwt.verify(token, JWT_SECRET).userId;
    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace('/api', '').replace(/\/+$/, '') || '/';
    const db = getPool();

    try {
        // ── Card Image Proxy (bypasses CORS) ──
        if (path === '/card-image' && req.method === 'GET') {
            const imageUrl = url.searchParams.get('url');
            if (!imageUrl) return res.status(400).json({ error: 'Missing url' });

            try {
                const axios = require('axios');
                const imgRes = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://mazoku.cc/'
                    }
                });
                res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(Buffer.from(imgRes.data));
            } catch (e) {
                const svg = `<svg width="100" height="140" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="140" fill="#1a3a5c" rx="8"/><text x="50" y="75" text-anchor="middle" fill="#f4a261" font-size="12">Card</text></svg>`;
                res.setHeader('Content-Type', 'image/svg+xml');
                return res.send(svg);
            }
        }

        // ── One‑click login ──
        if (path === '/login' && req.method === 'GET') {
            const token = url.searchParams.get('token');
            if (!token) return res.status(400).json({ error: 'Missing token' });

            const conn = await db.getConnection();
            try {
                const [[row]] = await conn.execute(
                    'SELECT user_id FROM link_tokens WHERE token = ? AND expires_at > NOW()', [token]
                );
                if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
                await conn.execute('DELETE FROM link_tokens WHERE token = ?', [token]);

                const [[player]] = await conn.execute(
                    `SELECT user_id, pirate_name, level, xp, beli, bank, gems, gold_coins, premium_until
                     FROM players WHERE user_id = ?`, [row.user_id]
                );
                if (!player) return res.status(404).json({ error: 'Player not found' });

                const jwtToken = jwt.sign({ userId: player.user_id }, JWT_SECRET, { expiresIn: '7d' });
                return res.json({
                    token: jwtToken,
                    user: { id: player.user_id, pirate_name: player.pirate_name, level: player.level, beli: player.beli, gems: player.gems }
                });
            } finally { conn.release(); }
        }

        // ── Protected routes ──
        const userId = getUserIdFromToken(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Profile
        if (path.startsWith('/profile/') && req.method === 'GET') {
            const id = path.split('/profile/')[1];
            const [[player]] = await db.execute('SELECT * FROM players WHERE user_id = ?', [id]);
            if (!player) return res.status(404).json({ error: 'Player not found' });
            const [[{ cards }]] = await db.execute('SELECT COUNT(*) as cards FROM cards WHERE owner_id = ?', [id]);
            const [[{ pokemon }]] = await db.execute('SELECT COUNT(*) as pokemon FROM pokemon WHERE owner_id = ?', [id]);
            return res.json({ ...player, cardCount: cards, pokemonCount: pokemon });
        }

        // Cards collection
        if (path.startsWith('/cards/') && req.method === 'GET') {
            const owner = path.split('/cards/')[1];
            const [cards] = await db.execute('SELECT * FROM cards WHERE owner_id = ? ORDER BY rarity_order DESC LIMIT 100', [owner]);
            return res.json(cards);
        }

        // Card shop
        if (path === '/shop/cards' && req.method === 'GET') {
            const [listings] = await db.execute(`
                SELECT cl.id, c.card_name, c.rarity, c.attack, c.defense, c.image_url,
                       cl.price, p.pirate_name as seller_name
                FROM card_listings cl JOIN cards c ON cl.card_id = c.id JOIN players p ON cl.seller_id = p.user_id
                WHERE cl.status = 'active' AND cl.expires_at > NOW() ORDER BY cl.created_at DESC
            `);
            return res.json(listings);
        }

        if (path === '/shop/buy' && req.method === 'POST') {
            const { listingId } = req.body || {};
            if (!listingId) return res.status(400).json({ error: 'Missing listingId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[listing]] = await conn.execute("SELECT * FROM card_listings WHERE id = ? AND status = 'active' FOR UPDATE", [listingId]);
                if (!listing) throw new Error('Listing not available');
                const [[buyer]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!buyer || buyer.beli < listing.price) throw new Error('Not enough Beli');
                await conn.execute('UPDATE cards SET owner_id = ? WHERE id = ?', [userId, listing.card_id]);
                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [listing.price, userId]);
                await conn.execute('UPDATE players SET beli = beli + ? WHERE user_id = ?', [listing.price, listing.seller_id]);
                await conn.execute("UPDATE card_listings SET status = 'sold', buyer_id = ? WHERE id = ?", [userId, listingId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // Auctions
        if (path === '/auctions' && req.method === 'GET') {
            const [auctions] = await db.execute(`
                SELECT a.*, c.card_name, c.rarity, c.image_url
                FROM auctions a JOIN cards c ON a.card_id = c.id
                WHERE a.status = 'active' AND a.end_time > NOW()
            `);
            return res.json(auctions);
        }

        if (path === '/auctions/bid' && req.method === 'POST') {
            const { auctionId, amount } = req.body || {};
            if (!auctionId || !amount) return res.status(400).json({ error: 'Missing fields' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[auction]] = await conn.execute("SELECT * FROM auctions WHERE id = ? AND status = 'active' FOR UPDATE", [auctionId]);
                if (!auction) throw new Error('Auction not active');
                if (amount <= auction.current_bid) throw new Error('Bid too low');
                const [[bidder]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!bidder || bidder.beli < amount) throw new Error('Not enough Beli');
                if (auction.current_bid > auction.starting_bid) {
                    const [[prev]] = await conn.execute('SELECT bidder_id FROM auction_bids WHERE auction_id = ? ORDER BY bid_amount DESC LIMIT 1', [auctionId]);
                    if (prev && prev.bidder_id !== userId) {
                        await conn.execute('UPDATE players SET beli = beli + ? WHERE user_id = ?', [auction.current_bid, prev.bidder_id]);
                    }
                }
                await conn.execute('INSERT INTO auction_bids (auction_id, bidder_id, bid_amount) VALUES (?, ?, ?)', [auctionId, userId, amount]);
                await conn.execute('UPDATE auctions SET current_bid = ? WHERE id = ?', [amount, auctionId]);
                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [amount, userId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // Event store
        if (path === '/events/cards' && req.method === 'GET') {
            const [items] = await db.execute("SELECT * FROM store_items WHERE price_coins > 0 AND (stock > 0 OR stock = -1)");
            return res.json(items);
        }

        if (path === '/events/buy' && req.method === 'POST') {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM store_items WHERE id = ? FOR UPDATE', [itemId]);
                if (!item || item.price_coins <= 0) throw new Error('Invalid item');
                if (item.stock === 0) throw new Error('Out of stock');
                const [[player]] = await conn.execute('SELECT gold_coins FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player || player.gold_coins < item.price_coins) throw new Error('Not enough Gold Coins');
                await conn.execute('UPDATE players SET gold_coins = gold_coins - ? WHERE user_id = ?', [item.price_coins, userId]);
                await conn.execute('INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1', [userId, item.name, item.item_type]);
                if (item.stock > 0) await conn.execute('UPDATE store_items SET stock = stock - 1 WHERE id = ?', [itemId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // Item Store
        if (path === '/store/items' && req.method === 'GET') {
            const [items] = await db.execute("SELECT * FROM store_items WHERE (price_gems > 0 OR price_beli > 0) AND (stock > 0 OR stock = -1)");
            return res.json(items);
        }

        if (path === '/store/buy-item' && req.method === 'POST') {
            const { itemId } = req.body || {};
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM store_items WHERE id = ? FOR UPDATE', [itemId]);
                if (!item) throw new Error('Item not found');
                const [[player]] = await conn.execute('SELECT beli, gems FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                let paid = false;
                if (item.price_gems > 0 && player.gems >= item.price_gems) {
                    await conn.execute('UPDATE players SET gems = gems - ? WHERE user_id = ?', [item.price_gems, userId]); paid = true;
                } else if (item.price_beli > 0 && player.beli >= item.price_beli) {
                    await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]); paid = true;
                }
                if (!paid) throw new Error('Not enough currency');
                await conn.execute('INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1', [userId, item.name, item.item_type]);
                if (item.stock > 0) await conn.execute('UPDATE store_items SET stock = stock - 1 WHERE id = ?', [itemId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // PokéMart
        if (path === '/store/pokemart' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM pokemon_shop ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-pokemart' && req.method === 'POST') {
            const { itemId } = req.body || {};
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM pokemon_shop WHERE id = ? FOR UPDATE', [itemId]);
                const [[player]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player || player.beli < item.price_beli) throw new Error('Not enough Beli');
                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]);
                await conn.execute('INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?', [userId, item.name, item.item_type, item.quantity_per_purchase, item.quantity_per_purchase]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // Guild Store
        if (path === '/store/guild' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM guild_store_items ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-guild' && req.method === 'POST') {
            const { itemId } = req.body || {};
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM guild_store_items WHERE id = ? FOR UPDATE', [itemId]);
                const [[player]] = await conn.execute('SELECT guild_id, dust FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player?.guild_id) throw new Error('Not in a guild');
                if (player.dust < item.price_dust) throw new Error('Not enough Dust');
                await conn.execute('UPDATE players SET dust = dust - ? WHERE user_id = ?', [item.price_dust, userId]);
                await conn.execute('INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1', [userId, item.name, item.item_type]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // Hatchery
        if (path === '/store/hatchery' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM hatchery_items ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-hatchery' && req.method === 'POST') {
            const { itemId } = req.body || {};
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM hatchery_items WHERE id = ? FOR UPDATE', [itemId]);
                const [[player]] = await conn.execute('SELECT beli, gems FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                let paid = false;
                if (item.price_gems > 0 && player.gems >= item.price_gems) {
                    await conn.execute('UPDATE players SET gems = gems - ? WHERE user_id = ?', [item.price_gems, userId]); paid = true;
                } else if (item.price_beli > 0 && player.beli >= item.price_beli) {
                    await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]); paid = true;
                }
                if (!paid) throw new Error('Not enough currency');
                await conn.execute('INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?', [userId, item.name, 'egg', item.pokemon_count, item.pokemon_count]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) { await conn.rollback(); return res.status(400).json({ error: err.message }); }
            finally { conn.release(); }
        }

        // ── CARD DUELS ──

        if (path === '/duel/active' && req.method === 'GET') {
            const [duels] = await db.execute(
                `SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' LIMIT 1`,
                [userId, userId]
            );
            if (!duels.length) return res.json({ active: false });
            const duel = duels[0];
            const isP1 = duel.player1_id === userId;
            const [opponent] = await db.execute('SELECT pirate_name FROM players WHERE user_id = ?', [
                isP1 ? duel.player2_id : duel.player1_id
            ]);
            return res.json({
                active: true,
                duel: {
                    id: duel.id,
                    opponent: opponent[0]?.pirate_name || 'Unknown',
                    playerHP: isP1 ? duel.p1_hp : duel.p2_hp,
                    opponentHP: isP1 ? duel.p2_hp : duel.p1_hp,
                    playerField: JSON.parse(isP1 ? duel.p1_field : duel.p2_field),
                    opponentField: JSON.parse(isP1 ? duel.p2_field : duel.p1_field),
                    playerHand: JSON.parse(isP1 ? duel.p1_hand : duel.p2_hand),
                    playerDeckCount: JSON.parse(isP1 ? duel.p1_deck : duel.p2_deck).length,
                    opponentDeckCount: JSON.parse(isP1 ? duel.p2_deck : duel.p1_deck).length,
                    playerGrave: JSON.parse(isP1 ? duel.p1_graveyard : duel.p2_graveyard).length,
                    opponentGrave: JSON.parse(isP1 ? duel.p2_graveyard : duel.p1_graveyard).length,
                    isMyTurn: duel.current_turn === userId,
                    phase: duel.phase,
                    turnCount: duel.turn_count,
                    lastAction: duel.last_action
                }
            });
        }

        if (path === '/duel/pending' && req.method === 'GET') {
            const [duels] = await db.execute(
                `SELECT d.*, p.pirate_name as challenger_name 
                 FROM card_duels d JOIN players p ON d.player1_id = p.user_id
                 WHERE d.player2_id = ? AND d.status = 'pending' ORDER BY d.created_at DESC`,
                [userId]
            );
            return res.json(duels);
        }

        if (path === '/duel/challenge' && req.method === 'POST') {
            const { opponentId } = req.body || {};
            if (!opponentId) return res.status(400).json({ error: 'Missing opponent' });
            const [[active]] = await db.execute(
                `SELECT id FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status IN ('active','pending')`,
                [userId, userId]
            );
            if (active) return res.status(400).json({ error: 'Already in a duel' });
            const [p1Cards] = await db.execute('SELECT * FROM cards WHERE owner_id = ? AND deck_number = 1', [userId]);
            const [p2Cards] = await db.execute('SELECT * FROM cards WHERE owner_id = ? AND deck_number = 1', [opponentId]);
            if (p1Cards.length < 5 || p2Cards.length < 5) return res.status(400).json({ error: 'Both need 5+ cards in Deck 1' });
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
            const p1Deck = shuffle(p1Cards).map(c => ({ id: c.id, name: c.card_name, attack: c.attack, defense: c.defense, rarity: c.rarity, series: c.source, img: c.image_url }));
            const p2Deck = shuffle(p2Cards).map(c => ({ id: c.id, name: c.card_name, attack: c.attack, defense: c.defense, rarity: c.rarity, series: c.source, img: c.image_url }));
            const p1Hand = p1Deck.splice(0, 5);
            const p2Hand = p2Deck.splice(0, 5);
            await db.execute(
                `INSERT INTO card_duels (player1_id, player2_id, p1_deck, p2_deck, p1_hand, p2_hand, current_turn, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [userId, opponentId, JSON.stringify(p1Deck), JSON.stringify(p2Deck), JSON.stringify(p1Hand), JSON.stringify(p2Hand), userId]
            );
            return res.json({ success: true });
        }

        if (path === '/duel/accept' && req.method === 'POST') {
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE player2_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [userId]);
            if (!duel) return res.status(400).json({ error: 'No pending duel' });
            await db.execute(`UPDATE card_duels SET status = 'active', phase = 'draw', last_action = 'Duel started!' WHERE id = ?`, [duel.id]);
            return res.json({ success: true });
        }

        if (path === '/duel/decline' && req.method === 'POST') {
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE player2_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [userId]);
            if (!duel) return res.status(400).json({ error: 'No pending duel' });
            await db.execute(`UPDATE card_duels SET status = 'cancelled' WHERE id = ?`, [duel.id]);
            return res.json({ success: true });
        }

        if (path === '/duel/draw' && req.method === 'POST') {
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' AND current_turn = ?`, [userId, userId, userId]);
            if (!duel) return res.status(400).json({ error: 'Not your turn' });
            const isP1 = duel.player1_id === userId;
            const deck = JSON.parse(isP1 ? duel.p1_deck : duel.p2_deck);
            const hand = JSON.parse(isP1 ? duel.p1_hand : duel.p2_hand);
            if (hand.length >= 7) return res.status(400).json({ error: 'Hand full' });
            if (!deck.length) return res.status(400).json({ error: 'Deck empty' });
            const card = deck.shift();
            hand.push(card);
            await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_deck' : 'p2_deck'} = ?, ${isP1 ? 'p1_hand' : 'p2_hand'} = ?, phase = 'main', last_action = ? WHERE id = ?`, [JSON.stringify(deck), JSON.stringify(hand), `Drew: ${card.name}`, duel.id]);
            return res.json({ success: true, card });
        }

        if (path === '/duel/summon' && req.method === 'POST') {
            const { handSlot, position } = req.body || {};
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' AND current_turn = ?`, [userId, userId, userId]);
            if (!duel) return res.status(400).json({ error: 'Not your turn' });
            const isP1 = duel.player1_id === userId;
            if (isP1 ? duel.p1_normal_summoned : duel.p2_normal_summoned) return res.status(400).json({ error: 'Already summoned' });
            const hand = JSON.parse(isP1 ? duel.p1_hand : duel.p2_hand);
            const field = JSON.parse(isP1 ? duel.p1_field : duel.p2_field);
            if (field.length >= 5) return res.status(400).json({ error: 'Field full' });
            const card = hand.splice(handSlot, 1)[0];
            if (!card) return res.status(400).json({ error: 'Invalid slot' });
            card.position = position || 'atk';
            card.faceDown = false;
            field.push(card);
            await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_hand' : 'p2_hand'} = ?, ${isP1 ? 'p1_field' : 'p2_field'} = ?, ${isP1 ? 'p1_normal_summoned' : 'p2_normal_summoned'} = 1, last_action = ? WHERE id = ?`, [JSON.stringify(hand), JSON.stringify(field), `Summoned ${card.name}`, duel.id]);
            return res.json({ success: true });
        }

        if (path === '/duel/attack' && req.method === 'POST') {
            const { fieldSlot, targetSlot } = req.body || {};
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' AND current_turn = ?`, [userId, userId, userId]);
            if (!duel) return res.status(400).json({ error: 'Not your turn' });
            const isP1 = duel.player1_id === userId;
            const attackerField = JSON.parse(isP1 ? duel.p1_field : duel.p2_field);
            const defenderField = JSON.parse(isP1 ? duel.p2_field : duel.p1_field);
            const attacked = JSON.parse(isP1 ? duel.p1_attacked_this_turn : duel.p2_attacked_this_turn);
            if (attacked.includes(fieldSlot)) return res.status(400).json({ error: 'Already attacked' });
            const attacker = attackerField[fieldSlot];
            if (!attacker || attacker.position !== 'atk') return res.status(400).json({ error: 'Invalid attacker' });
            let result = { damage: 0, destroyed: false, gameOver: false };

            if (!defenderField.length) {
                result.damage = attacker.attack;
                const newHP = Math.max(0, (isP1 ? duel.p2_hp : duel.p1_hp) - result.damage);
                await db.execute(`UPDATE card_duels SET ${isP1 ? 'p2_hp' : 'p1_hp'} = ?, last_action = ? WHERE id = ?`, [newHP, `${attacker.name} attacks directly for ${result.damage}!`, duel.id]);
                if (newHP <= 0) { result.gameOver = true; await db.execute(`UPDATE card_duels SET status = 'finished', winner_id = ? WHERE id = ?`, [userId, duel.id]); await db.execute('UPDATE players SET beli = beli + 1000, xp = xp + 50 WHERE user_id = ?', [userId]); }
            } else {
                const targetIdx = targetSlot || 0;
                const defender = defenderField[targetIdx];
                if (!defender) return res.status(400).json({ error: 'Invalid target' });
                if (defender.position === 'atk') {
                    if (attacker.attack > defender.attack) {
                        result.damage = attacker.attack - defender.attack; result.destroyed = true;
                        const newHP = Math.max(0, (isP1 ? duel.p2_hp : duel.p1_hp) - result.damage);
                        defenderField.splice(targetIdx, 1);
                        const grave = JSON.parse(isP1 ? duel.p2_graveyard : duel.p1_graveyard); grave.push(defender);
                        await db.execute(`UPDATE card_duels SET ${isP1 ? 'p2_hp' : 'p1_hp'} = ?, ${isP1 ? 'p2_field' : 'p1_field'} = ?, ${isP1 ? 'p2_graveyard' : 'p1_graveyard'} = ?, last_action = ? WHERE id = ?`, [newHP, JSON.stringify(defenderField), JSON.stringify(grave), `${attacker.name} destroyed ${defender.name}!`, duel.id]);
                    } else if (attacker.attack === defender.attack) {
                        result.destroyed = true; attackerField.splice(fieldSlot, 1); defenderField.splice(targetIdx, 1);
                        await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_field' : 'p2_field'} = ?, ${isP1 ? 'p2_field' : 'p1_field'} = ?, last_action = ? WHERE id = ?`, [JSON.stringify(attackerField), JSON.stringify(defenderField), 'Both destroyed!', duel.id]);
                    } else {
                        result.damage = defender.attack - attacker.attack;
                        const newHP = Math.max(0, (isP1 ? duel.p1_hp : duel.p2_hp) - result.damage);
                        attackerField.splice(fieldSlot, 1);
                        await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_hp' : 'p2_hp'} = ?, ${isP1 ? 'p1_field' : 'p2_field'} = ?, last_action = ? WHERE id = ?`, [newHP, JSON.stringify(attackerField), `${attacker.name} was destroyed!`, duel.id]);
                    }
                } else {
                    if (attacker.attack > defender.defense) {
                        result.destroyed = true; defenderField.splice(targetIdx, 1);
                        const grave = JSON.parse(isP1 ? duel.p2_graveyard : duel.p1_graveyard); grave.push(defender);
                        await db.execute(`UPDATE card_duels SET ${isP1 ? 'p2_field' : 'p1_field'} = ?, ${isP1 ? 'p2_graveyard' : 'p1_graveyard'} = ?, last_action = ? WHERE id = ?`, [JSON.stringify(defenderField), JSON.stringify(grave), `${attacker.name} destroyed ${defender.name}!`, duel.id]);
                    } else {
                        result.damage = defender.defense - attacker.attack;
                        const newHP = Math.max(0, (isP1 ? duel.p1_hp : duel.p2_hp) - result.damage);
                        await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_hp' : 'p2_hp'} = ?, last_action = ? WHERE id = ?`, [newHP, `${attacker.name} took recoil damage!`, duel.id]);
                    }
                }
            }
            attacked.push(fieldSlot);
            await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_attacked_this_turn' : 'p2_attacked_this_turn'} = ?, phase = 'battle' WHERE id = ?`, [JSON.stringify(attacked), duel.id]);
            return res.json({ success: true, result });
        }

        if (path === '/duel/set' && req.method === 'POST') {
            const { handSlot } = req.body || {};
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' AND current_turn = ?`, [userId, userId, userId]);
            if (!duel) return res.status(400).json({ error: 'Not your turn' });
            const isP1 = duel.player1_id === userId;
            const hand = JSON.parse(isP1 ? duel.p1_hand : duel.p2_hand);
            const field = JSON.parse(isP1 ? duel.p1_field : duel.p2_field);
            if (field.length >= 5) return res.status(400).json({ error: 'Field full' });
            const card = hand.splice(handSlot, 1)[0];
            if (!card) return res.status(400).json({ error: 'Invalid slot' });
            card.position = 'def'; card.faceDown = true; field.push(card);
            await db.execute(`UPDATE card_duels SET ${isP1 ? 'p1_hand' : 'p2_hand'} = ?, ${isP1 ? 'p1_field' : 'p2_field'} = ?, last_action = ? WHERE id = ?`, [JSON.stringify(hand), JSON.stringify(field), 'Set a card face-down', duel.id]);
            return res.json({ success: true });
        }

        if (path === '/duel/endturn' && req.method === 'POST') {
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active' AND current_turn = ?`, [userId, userId, userId]);
            if (!duel) return res.status(400).json({ error: 'Not your turn' });
            const isP1 = duel.player1_id === userId;
            const nextTurn = isP1 ? duel.player2_id : duel.player1_id;
            await db.execute(`UPDATE card_duels SET current_turn = ?, phase = 'draw', ${isP1 ? 'p1_normal_summoned' : 'p2_normal_summoned'} = 0, ${isP1 ? 'p1_attacked_this_turn' : 'p2_attacked_this_turn'} = '[]', turn_count = turn_count + 1 WHERE id = ?`, [nextTurn, duel.id]);
            return res.json({ success: true });
        }

        if (path === '/duel/surrender' && req.method === 'POST') {
            const [[duel]] = await db.execute(`SELECT * FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'active'`, [userId, userId]);
            if (!duel) return res.status(400).json({ error: 'No active duel' });
            const winner = duel.player1_id === userId ? duel.player2_id : duel.player1_id;
            await db.execute(`UPDATE card_duels SET status = 'finished', winner_id = ? WHERE id = ?`, [winner, duel.id]);
            await db.execute('UPDATE players SET beli = beli + 1000, xp = xp + 50 WHERE user_id = ?', [winner]);
            return res.json({ success: true });
        }

        if (path === '/duel/stats' && req.method === 'GET') {
            const [[stats]] = await db.execute(
                `SELECT COUNT(*) as total, SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins FROM card_duels WHERE (player1_id = ? OR player2_id = ?) AND status = 'finished'`,
                [userId, userId, userId]
            );
            return res.json({ total: stats.total || 0, wins: stats.wins || 0, losses: (stats.total || 0) - (stats.wins || 0) });
        }

        if (path === '/duel/players' && req.method === 'GET') {
            const [players] = await db.execute(
                `SELECT user_id, pirate_name, level FROM players WHERE user_id != ? AND user_id IN (SELECT DISTINCT owner_id FROM cards WHERE deck_number = 1) LIMIT 20`,
                [userId]
            );
            return res.json(players);
        }

        // Leaderboard
        if (path.startsWith('/leaderboard/') && req.method === 'GET') {
            const type = path.split('/leaderboard/')[1];
            let query;
            switch (type) {
                case 'level': query = 'SELECT pirate_name, level, xp FROM players ORDER BY level DESC LIMIT 20'; break;
                case 'richest': query = 'SELECT pirate_name, beli + bank AS total FROM players ORDER BY total DESC LIMIT 20'; break;
                case 'legendary': query = "SELECT p.pirate_name, COUNT(c.id) as count FROM players p LEFT JOIN cards c ON p.user_id = c.owner_id AND c.rarity = 'Legendary' GROUP BY p.user_id ORDER BY count DESC LIMIT 20"; break;
                default: return res.status(400).json({ error: 'Invalid type' });
            }
            const [rows] = await db.execute(query);
            return res.json(rows);
        }

        return res.status(404).json({ error: 'Not found' });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};