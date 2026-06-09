// api/auth.js
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// ── Database pool ──
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

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

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
                    user: {
                        id: player.user_id,
                        pirate_name: player.pirate_name,
                        level: player.level,
                        beli: player.beli,
                        gems: player.gems
                    }
                });
            } finally {
                conn.release();
            }
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
            const [cards] = await db.execute(
                'SELECT * FROM cards WHERE owner_id = ? ORDER BY rarity_order DESC LIMIT 100', [owner]
            );
            return res.json(cards);
        }

        // Card shop
        if (path === '/shop/cards' && req.method === 'GET') {
            const [listings] = await db.execute(`
                SELECT cl.id, c.card_name, c.rarity, c.attack, c.defense, c.image_url,
                       cl.price, p.pirate_name as seller_name
                FROM card_listings cl
                JOIN cards c ON cl.card_id = c.id
                JOIN players p ON cl.seller_id = p.user_id
                WHERE cl.status = 'active' AND cl.expires_at > NOW()
                ORDER BY cl.created_at DESC
            `);
            return res.json(listings);
        }

        if (path === '/shop/buy' && req.method === 'POST') {
            const { listingId } = req.body || {};
            if (!listingId) return res.status(400).json({ error: 'Missing listingId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[listing]] = await conn.execute(
                    'SELECT * FROM card_listings WHERE id = ? AND status = "active" FOR UPDATE', [listingId]
                );
                if (!listing) throw new Error('Listing not available');
                const [[buyer]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!buyer || buyer.beli < listing.price) throw new Error('Not enough Beli');

                await conn.execute('UPDATE cards SET owner_id = ? WHERE id = ?', [userId, listing.card_id]);
                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [listing.price, userId]);
                await conn.execute('UPDATE players SET beli = beli + ? WHERE user_id = ?', [listing.price, listing.seller_id]);
                await conn.execute("UPDATE card_listings SET status = 'sold', buyer_id = ? WHERE id = ?", [userId, listingId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // Auctions
        if (path === '/auctions' && req.method === 'GET') {
            const [auctions] = await db.execute(`
                SELECT a.*, c.card_name, c.rarity, c.image_url,
                       (SELECT bidder_id FROM auction_bids WHERE auction_id = a.id ORDER BY bid_amount DESC LIMIT 1) as top_bidder
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
                const [[auction]] = await conn.execute(
                    'SELECT * FROM auctions WHERE id = ? AND status = "active" FOR UPDATE', [auctionId]
                );
                if (!auction) throw new Error('Auction not active');
                if (amount <= auction.current_bid) throw new Error('Bid too low');

                const [[bidder]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!bidder || bidder.beli < amount) throw new Error('Not enough Beli');

                if (auction.current_bid > auction.starting_bid) {
                    const [[prev]] = await conn.execute(
                        'SELECT bidder_id FROM auction_bids WHERE auction_id = ? ORDER BY bid_amount DESC LIMIT 1',
                        [auctionId]
                    );
                    if (prev && prev.bidder_id !== userId) {
                        await conn.execute('UPDATE players SET beli = beli + ? WHERE user_id = ?', [auction.current_bid, prev.bidder_id]);
                    }
                }

                await conn.execute('INSERT INTO auction_bids (auction_id, bidder_id, bid_amount) VALUES (?, ?, ?)', [auctionId, userId, amount]);
                await conn.execute('UPDATE auctions SET current_bid = ? WHERE id = ?', [amount, auctionId]);
                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [amount, userId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // Event store
        if (path === '/events/cards' && req.method === 'GET') {
            const [items] = await db.execute(
                'SELECT * FROM store_items WHERE price_coins > 0 AND (stock > 0 OR stock = -1)'
            );
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
                await conn.execute(
                    'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
                    [userId, item.name, item.item_type]
                );
                if (item.stock > 0) await conn.execute('UPDATE store_items SET stock = stock - 1 WHERE id = ?', [itemId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // ── Item Store (Beli / Gems) ──
        if (path === '/store/items' && req.method === 'GET') {
            const [items] = await db.execute(
                'SELECT * FROM store_items WHERE (price_gems > 0 OR price_beli > 0) AND (stock > 0 OR stock = -1)'
            );
            return res.json(items);
        }

        if (path === '/store/buy-item' && req.method === 'POST') {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM store_items WHERE id = ? FOR UPDATE', [itemId]);
                if (!item) throw new Error('Item not found');
                if (item.stock === 0) throw new Error('Out of stock');

                const [[player]] = await conn.execute('SELECT beli, gems FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player) throw new Error('Player not found');

                let paid = false;
                if (item.price_gems > 0 && player.gems >= item.price_gems) {
                    await conn.execute('UPDATE players SET gems = gems - ? WHERE user_id = ?', [item.price_gems, userId]);
                    paid = true;
                } else if (item.price_beli > 0 && player.beli >= item.price_beli) {
                    await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]);
                    paid = true;
                }
                if (!paid) throw new Error('Not enough gems or beli');

                await conn.execute(
                    'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
                    [userId, item.name, item.item_type]
                );
                if (item.stock > 0) await conn.execute('UPDATE store_items SET stock = stock - 1 WHERE id = ?', [itemId]);
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // ── PokéMart (Beli) ──
        if (path === '/store/pokemart' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM pokemon_shop ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-pokemart' && req.method === 'POST') {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM pokemon_shop WHERE id = ? FOR UPDATE', [itemId]);
                if (!item) throw new Error('Item not found');

                const [[player]] = await conn.execute('SELECT beli FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player || player.beli < item.price_beli) throw new Error('Not enough Beli');

                await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]);
                await conn.execute(
                    'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
                    [userId, item.name, item.item_type, item.quantity_per_purchase, item.quantity_per_purchase]
                );
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // ── Guild Store (Dust) ──
        if (path === '/store/guild' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM guild_store_items ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-guild' && req.method === 'POST') {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM guild_store_items WHERE id = ? FOR UPDATE', [itemId]);
                if (!item) throw new Error('Item not found');

                // Check guild membership and dust balance
                const [[player]] = await conn.execute(
                    'SELECT guild_id, dust FROM players WHERE user_id = ? FOR UPDATE', [userId]
                );
                if (!player || !player.guild_id) throw new Error('You must be in a guild to buy from the Guild Store');
                if (player.dust < item.price_dust) throw new Error('Not enough Dust');

                await conn.execute('UPDATE players SET dust = dust - ? WHERE user_id = ?', [item.price_dust, userId]);
                await conn.execute(
                    'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
                    [userId, item.name, item.item_type]
                );
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // ── Hatchery (Beli / Gems) ──
        if (path === '/store/hatchery' && req.method === 'GET') {
            const [items] = await db.execute('SELECT * FROM hatchery_items ORDER BY id');
            return res.json(items);
        }

        if (path === '/store/buy-hatchery' && req.method === 'POST') {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[item]] = await conn.execute('SELECT * FROM hatchery_items WHERE id = ? FOR UPDATE', [itemId]);
                if (!item) throw new Error('Item not found');

                const [[player]] = await conn.execute('SELECT beli, gems FROM players WHERE user_id = ? FOR UPDATE', [userId]);
                if (!player) throw new Error('Player not found');

                let paid = false;
                if (item.price_gems > 0 && player.gems >= item.price_gems) {
                    await conn.execute('UPDATE players SET gems = gems - ? WHERE user_id = ?', [item.price_gems, userId]);
                    paid = true;
                } else if (item.price_beli > 0 && player.beli >= item.price_beli) {
                    await conn.execute('UPDATE players SET beli = beli - ? WHERE user_id = ?', [item.price_beli, userId]);
                    paid = true;
                }
                if (!paid) throw new Error('Not enough gems or beli');

                // Add egg to inventory
                await conn.execute(
                    'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
                    [userId, item.name, 'egg', item.pokemon_count, item.pokemon_count]
                );
                await conn.commit();
                return res.json({ success: true });
            } catch (err) {
                await conn.rollback();
                return res.status(400).json({ error: err.message });
            } finally {
                conn.release();
            }
        }

        // Leaderboard
        if (path.startsWith('/leaderboard/') && req.method === 'GET') {
            const type = path.split('/leaderboard/')[1];
            let query;
            switch (type) {
                case 'level':
                    query = 'SELECT pirate_name, level, xp FROM players ORDER BY level DESC LIMIT 20';
                    break;
                case 'richest':
                    query = 'SELECT pirate_name, beli + bank AS total FROM players ORDER BY total DESC LIMIT 20';
                    break;
                case 'legendary':
                    query = `SELECT p.pirate_name, COUNT(c.id) as count
                             FROM players p LEFT JOIN cards c ON p.user_id = c.owner_id AND c.rarity = 'Legendary'
                             GROUP BY p.user_id ORDER BY count DESC LIMIT 20`;
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid type' });
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