const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
});

function verify(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const [rows] = await pool.execute('SELECT * FROM store_items ORDER BY id');
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const user = verify(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { itemId } = req.body;

    const [[item]] = await pool.execute('SELECT * FROM store_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [[player]] = await pool.execute('SELECT beli, gems, gold_coins FROM players WHERE user_id = ?', [user.userId]);
    if (item.price_beli > player.beli) return res.status(400).json({ error: 'Not enough Beli' });
    if (item.price_gems > player.gems) return res.status(400).json({ error: 'Not enough Gems' });

    await pool.execute('UPDATE players SET beli = beli - ?, gems = gems - ? WHERE user_id = ?',
      [item.price_beli, item.price_gems, user.userId]);
    await pool.execute(
      'INSERT INTO inventory (owner_id, item_name, item_type, quantity) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
      [user.userId, item.name, item.item_type]
    );
    return res.json({ success: true, message: `Purchased ${item.name}!` });
  }
};